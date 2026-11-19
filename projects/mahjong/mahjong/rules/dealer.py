from ..core.seat import Seat, next_seat


def determine_next_dealer(dealer: Seat, winner: Seat | None, result_type: str) -> Seat:
    if result_type not in {"HU", "DRAW"} or (result_type == "HU") != (winner is not None):
        raise ValueError("inconsistent result type and winner")
    return dealer if winner is None or winner == dealer else next_seat(dealer)
