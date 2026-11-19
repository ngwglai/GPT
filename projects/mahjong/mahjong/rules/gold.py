def get_opposite_tile(tile_type: int) -> int:
    if type(tile_type) is not int or not 0 <= tile_type < 34:
        raise ValueError("tile type must be 0..33")
    if tile_type < 27:
        return (tile_type // 9) * 9 + 8 - tile_type % 9
    return {27: 29, 29: 27, 28: 30, 30: 28, 31: 33, 33: 31, 32: 32}[tile_type]
