"""Asynchronous pacing shared by the local HTTP table and LAN rooms."""
import asyncio
import logging

from .controllers import CONTROLLERS

LOG = logging.getLogger(__name__)


def decide(ticket):
    return CONTROLLERS[ticket.mode].choose(ticket.view, int(ticket.seat), quad_pairs=ticket.quad_pairs)


class AutoRunner:
    def __init__(self, table, lock, publish=None, delay=0.24, can_run=None):
        self.table = table
        self.lock = lock
        self.publish = publish
        self.delay = delay
        self.task = None
        self.can_run = can_run or (lambda: True)

    def kick(self):
        if self.task is None and self.can_run():
            self.task = asyncio.create_task(self._run())

    async def _run(self):
        try:
            while True:
                async with self.lock:
                    if not self.can_run():
                        return
                    ting = self.table.ting_ticket()
                    ticket = self.table.ai_ticket() if ting is None else None
                    if ting is None and ticket is None:
                        self.task = None
                        return
                await asyncio.sleep(0.4 if ting is not None else self.delay)
                decision = await asyncio.to_thread(decide, ticket) if ting is None else None
                async with self.lock:
                    if not self.can_run():
                        return
                    applied = self.table.apply_ting(ting) if ting is not None else self.table.apply_ai(ticket, decision)
                    if applied and self.publish:
                        await self.publish()
        except asyncio.CancelledError:
            raise
        except Exception:
            # Avoid publishing private policy inputs or tracebacks.
            LOG.error("Mahjong controller stopped after an unexpected execution error")
        finally:
            if self.task is asyncio.current_task():
                self.task = None

    async def close(self):
        task = self.task
        if task:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
