"""Asynchronous pacing shared by the local HTTP table and LAN rooms."""
import asyncio
import logging

from .controllers import CONTROLLERS

LOG = logging.getLogger(__name__)


def decide(ticket):
    return CONTROLLERS[ticket.mode].choose(ticket.view, int(ticket.seat), quad_pairs=ticket.quad_pairs)


class AutoRunner:
    def __init__(self, table, lock, publish=None, delay=0.24):
        self.table = table
        self.lock = lock
        self.publish = publish
        self.delay = delay
        self.task = None

    def kick(self):
        if self.task is None:
            self.task = asyncio.create_task(self._run())

    async def _run(self):
        try:
            while True:
                async with self.lock:
                    ticket = self.table.ai_ticket()
                    if ticket is None:
                        return
                await asyncio.sleep(self.delay)
                decision = await asyncio.to_thread(decide, ticket)
                async with self.lock:
                    if self.table.apply_ai(ticket, decision) and self.publish:
                        await self.publish()
        except asyncio.CancelledError:
            raise
        except Exception:
            # Avoid publishing private policy inputs or tracebacks.
            LOG.error("Mahjong controller stopped after an unexpected execution error")
        finally:
            self.task = None

    async def close(self):
        task = self.task
        if task:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
