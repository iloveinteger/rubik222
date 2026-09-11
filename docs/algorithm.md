# Precompute algorithm

## State ID

A legal 2×2×2 state is represented by:

- corner permutation: `8! = 40320`
- first seven corner twists: `3^7 = 2187`

The eighth twist is forced by the total-twist constraint.

The state ID is:

```text
id = permRank * 2187 + oriRank
```

so:

```text
0 <= id < 88,179,840
```

## Moves

The web project uses exactly six QTM moves:

```text
0 R
1 R'
2 U
3 U'
4 F
5 F'
```

A move transforms:

```text
new.cp[pos] = old.cp[move.cp[pos]]
new.co[pos] = old.co[move.cp[pos]] + move.co[pos] (mod 3)
```

This allows the permutation and orientation coordinate transitions to be
precomputed independently.

## BFS

The BFS is multi-source.

All 24 whole-cube rotations of the solved cube are inserted at depth 0.

When a state `next` is discovered from `current` using move `m`,
the table stores:

```text
bestMove[next] = inverse(m)
```

Therefore following `bestMove` repeatedly from any state reaches one of
the 24 solved orientations along a shortest path.

## Lookup format

`optimal_move.bin` stores one value per state using 3 bits:

```text
0..5 = R, R', U, U', F, F'
6    = solved
7    = unused/error
```

Bit order is little-endian within the byte stream.

The file contains exactly:

```text
ceil(88,179,840 * 3 / 8)
= 33,067,440 bytes
```

## Verification

The full precompute refuses to write the final file unless:

- all 24 solved orientations are distinct,
- every state is reached,
- the maximum distance is 14.
