from ..core.action import Action, ActionType
from ..core.seat import Seat, turn_order


class ResponseResolver:
    def __init__(self, priorities: dict[ActionType, int] | None = None):
        self.priorities = priorities or {ActionType.HU: 3, ActionType.MING_GANG: 2, ActionType.PENG: 2, ActionType.CHI: 1}
        if self.priorities.get(ActionType.HU, -1) <= max((v for k, v in self.priorities.items() if k != ActionType.HU), default=0):
            raise ValueError("HU must have strictly highest priority")

    def resolve(self, source: Seat, responses: dict[Seat, Action]) -> Action | None:
        order = {seat: i for i, seat in enumerate(turn_order(source, False))}
        choices = [a for a in responses.values() if a.type not in {ActionType.PASS, ActionType.PICK_ORPHAN}]
        chosen = min(choices, key=lambda a: (-self.priorities[a.type], order[a.seat]), default=None)
        if chosen is not None:
            return chosen
        pickups = (a for a in responses.values() if a.type == ActionType.PICK_ORPHAN)
        return min(pickups, key=lambda a: order[a.seat], default=None)
