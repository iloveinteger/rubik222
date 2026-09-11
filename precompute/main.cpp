
#include <array>
#include <cassert>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <random>
#include <string>
#include <vector>
#include <algorithm>

using namespace std;

constexpr int NUM_CORNERS = 8;
constexpr int PERM_COUNT = 40320;
constexpr int ORI_COUNT = 2187;
constexpr uint32_t STATE_COUNT =
    static_cast<uint32_t>(PERM_COUNT) * ORI_COUNT;

enum Move : uint8_t {
    R = 0,
    RP = 1,
    U = 2,
    UP = 3,
    F = 4,
    FP = 5,
    MOVE_COUNT = 6
};

constexpr uint8_t UNVISITED = 7;
constexpr uint8_t SOLVED = 6;

constexpr array<uint8_t, MOVE_COUNT> INVERSE_MOVE = {
    RP, R, UP, U, FP, F
};

const char* moveName(Move m) {
    static constexpr const char* names[] = {
        "R", "R'", "U", "U'", "F", "F'"
    };
    return names[m];
}

struct Cube {
    array<uint8_t, 8> cp{};
    array<uint8_t, 8> co{};

    bool operator==(const Cube& other) const {
        return cp == other.cp && co == other.co;
    }
};

struct PackedNibbles {
    // Two values per byte.
    // Only values 0..7 are used.
    vector<uint8_t> data;

    explicit PackedNibbles(size_t count, uint8_t initial)
        : data((count + 1) / 2, 0) {
        if (initial != 0) {
            for (size_t i = 0; i < count; ++i) {
                set(i, initial);
            }
        }
    }

    uint8_t get(uint32_t index) const {
        uint8_t x = data[index >> 1];

        if (index & 1) {
            return x >> 4;
        }

        return x & 0x0F;
    }

    void set(uint32_t index, uint8_t value) {
        uint8_t& x = data[index >> 1];

        if (index & 1) {
            x = static_cast<uint8_t>((x & 0x0F) | (value << 4));
        } else {
            x = static_cast<uint8_t>((x & 0xF0) | value);
        }
    }
};

constexpr array<int, 9> FACT = {
    1, 1, 2, 6, 24, 120, 720, 5040, 40320
};

int permRank(const array<uint8_t, 8>& p) {
    int rank = 0;

    for (int i = 0; i < 8; ++i) {
        int smaller = 0;

        for (int j = i + 1; j < 8; ++j) {
            smaller += p[j] < p[i];
        }

        rank += smaller * FACT[7 - i];
    }

    return rank;
}

array<uint8_t, 8> permUnrank(int rank) {
    array<uint8_t, 8> result{};
    array<uint8_t, 8> available{};

    for (int i = 0; i < 8; ++i) {
        available[i] = static_cast<uint8_t>(i);
    }

    for (int i = 0; i < 8; ++i) {
        int f = FACT[7 - i];
        int index = rank / f;
        rank %= f;

        result[i] = available[index];

        for (int j = index; j < 7 - i; ++j) {
            available[j] = available[j + 1];
        }
    }

    return result;
}

int oriRank(const array<uint8_t, 8>& o) {
    int rank = 0;

    for (int i = 0; i < 7; ++i) {
        rank = rank * 3 + o[i];
    }

    return rank;
}

array<uint8_t, 8> oriUnrank(int rank) {
    array<uint8_t, 8> result{};
    int sum = 0;

    for (int i = 6; i >= 0; --i) {
        result[i] = static_cast<uint8_t>(rank % 3);
        sum += result[i];
        rank /= 3;
    }

    // The eighth corner is forced by total twist = 0 mod 3.
    result[7] = static_cast<uint8_t>((3 - sum % 3) % 3);

    return result;
}

uint32_t encode(const Cube& c) {
    return static_cast<uint32_t>(
        permRank(c.cp) * ORI_COUNT + oriRank(c.co)
    );
}

Cube decode(uint32_t id) {
    Cube c;

    int p = static_cast<int>(id / ORI_COUNT);
    int o = static_cast<int>(id % ORI_COUNT);

    c.cp = permUnrank(p);
    c.co = oriUnrank(o);

    return c;
}

/*
    A move cube is represented exactly like Kociemba's cubie-level
    representation:

        new.cp[pos] = old.cp[move.cp[pos]]
        new.co[pos] = old.co[move.cp[pos]] + move.co[pos] (mod 3)

    Corner order:

        URF UFL ULB UBR DFR DLF DBL DRB
*/

Cube makeCube(
    const array<uint8_t, 8>& cp,
    const array<uint8_t, 8>& co
) {
    Cube c;
    c.cp = cp;
    c.co = co;
    return c;
}

Cube multiply(const Cube& a, const Cube& b) {
    // a after b.
    Cube result;

    for (int i = 0; i < 8; ++i) {
        result.cp[i] = a.cp[b.cp[i]];
        result.co[i] = static_cast<uint8_t>(
            (a.co[b.cp[i]] + b.co[i]) % 3
        );
    }

    return result;
}

Cube power(Cube base, int n) {
    Cube result;

    for (int i = 0; i < 8; ++i) {
        result.cp[i] = static_cast<uint8_t>(i);
        result.co[i] = 0;
    }

    while (n > 0) {
        if (n & 1) {
            result = multiply(base, result);
        }

        base = multiply(base, base);
        n >>= 1;
    }

    return result;
}

array<Cube, MOVE_COUNT> makeMoves() {
    // Standard Kociemba move definitions.
    const Cube u = makeCube(
        {3, 0, 1, 2, 4, 5, 6, 7},
        {0, 0, 0, 0, 0, 0, 0, 0}
    );

    const Cube r = makeCube(
        {4, 1, 2, 0, 7, 5, 6, 3},
        {2, 0, 0, 1, 1, 0, 0, 2}
    );

    const Cube f = makeCube(
        {1, 5, 2, 3, 0, 4, 6, 7},
        {1, 2, 0, 0, 2, 1, 0, 0}
    );

    array<Cube, MOVE_COUNT> moves{};

    moves[R]  = r;
    moves[RP] = power(r, 3);

    moves[U]  = u;
    moves[UP] = power(u, 3);

    moves[F]  = f;
    moves[FP] = power(f, 3);

    return moves;
}

/*
    Three whole-cube rotations generate the 24 orientation-preserving
    symmetries.

    ROT_URF3 = 120° around the URF-DBL long diagonal
    ROT_F2   = 180° around the F-B axis
    ROT_U4   = 90° around the U-D axis

    These are the same corner-level symmetry generators used by
    Kociemba's symmetry tables.
*/

vector<Cube> makeSolvedOrientations() {
    const Cube rotURF3 = makeCube(
        {0, 4, 5, 1, 3, 7, 6, 2},
        {1, 2, 1, 2, 2, 1, 2, 1}
    );

    const Cube rotF2 = makeCube(
        {5, 4, 7, 6, 1, 0, 3, 2},
        {0, 0, 0, 0, 0, 0, 0, 0}
    );

    const Cube rotU4 = makeCube(
        {3, 0, 1, 2, 7, 4, 5, 6},
        {0, 0, 0, 0, 0, 0, 0, 0}
    );

    Cube identity;

    for (int i = 0; i < 8; ++i) {
        identity.cp[i] = static_cast<uint8_t>(i);
        identity.co[i] = 0;
    }

    vector<Cube> result;
    result.push_back(identity);

    for (size_t head = 0; head < result.size(); ++head) {
        const Cube current = result[head];

        const array<Cube, 3> generators = {
            rotURF3, rotF2, rotU4
        };

        for (const Cube& generator : generators) {
            Cube next = multiply(current, generator);

            bool exists = false;

            for (const Cube& x : result) {
                if (x == next) {
                    exists = true;
                    break;
                }
            }

            if (!exists) {
                result.push_back(next);
            }
        }
    }

    return result;
}

struct CoordinateTables {
    array<vector<uint16_t>, MOVE_COUNT> cpNext;
    array<vector<uint16_t>, MOVE_COUNT> coNext;
};

CoordinateTables buildCoordinateTables(
    const array<Cube, MOVE_COUNT>& moves
) {
    CoordinateTables tables;

    for (int m = 0; m < MOVE_COUNT; ++m) {
        tables.cpNext[m].resize(PERM_COUNT);
        tables.coNext[m].resize(ORI_COUNT);

        for (int rank = 0; rank < PERM_COUNT; ++rank) {
            array<uint8_t, 8> p = permUnrank(rank);
            array<uint8_t, 8> next{};

            for (int i = 0; i < 8; ++i) {
                next[i] = p[moves[m].cp[i]];
            }

            tables.cpNext[m][rank] =
                static_cast<uint16_t>(permRank(next));
        }

        for (int rank = 0; rank < ORI_COUNT; ++rank) {
            array<uint8_t, 8> o = oriUnrank(rank);
            array<uint8_t, 8> next{};

            for (int i = 0; i < 8; ++i) {
                next[i] = static_cast<uint8_t>(
                    (o[moves[m].cp[i]] + moves[m].co[i]) % 3
                );
            }

            // A legal move preserves the orientation constraint.
            assert(next[7] < 3);

            tables.coNext[m][rank] =
                static_cast<uint16_t>(oriRank(next));
        }
    }

    return tables;
}

vector<uint8_t> pack3Bit(const PackedNibbles& values) {
    const size_t byteCount =
        (static_cast<size_t>(STATE_COUNT) * 3 + 7) / 8;

    vector<uint8_t> output(byteCount, 0);

    for (uint32_t i = 0; i < STATE_COUNT; ++i) {
        uint8_t value = values.get(i);

        size_t bit = static_cast<size_t>(i) * 3;
        size_t byteIndex = bit >> 3;
        int shift = static_cast<int>(bit & 7);

        output[byteIndex] |=
            static_cast<uint8_t>(value << shift);

        if (shift > 5) {
            output[byteIndex + 1] |=
                static_cast<uint8_t>(value >> (8 - shift));
        }
    }

    return output;
}

void writeMetadata(
    const filesystem::path& path,
    uint32_t visited,
    int maxDepth
) {
    ofstream out(path);

    out << "{\n";
    out << "  \"format\": \"optimal_move_3bit_v1\",\n";
    out << "  \"state_count\": " << STATE_COUNT << ",\n";
    out << "  \"move_count\": 6,\n";
    out << "  \"moves\": [\"R\", \"R'\", \"U\", \"U'\", \"F\", \"F'\"],\n";
    out << "  \"solved_value\": 6,\n";
    out << "  \"unused_value\": 7,\n";
    out << "  \"visited_states\": " << visited << ",\n";
    out << "  \"max_distance\": " << maxDepth << ",\n";
    out << "  \"packing\": \"3 bits per state, little-endian bit order\"\n";
    out << "}\n";
}

void write3BitFile(
    const filesystem::path& path,
    const PackedNibbles& values
) {
    cout << "Packing 3-bit lookup table...\n";

    vector<uint8_t> packed = pack3Bit(values);

    ofstream out(path, ios::binary);

    if (!out) {
        throw runtime_error(
            "Could not open output file: " + path.string()
        );
    }

    out.write(
        reinterpret_cast<const char*>(packed.data()),
        static_cast<streamsize>(packed.size())
    );

    cout << "Wrote " << packed.size() << " bytes to "
         << path << '\n';
}

void runTests() {
    cout << "Running tests...\n";

    const auto moves = makeMoves();

    // ------------------------------------------------------------
    // Encode/decode round trip.
    // ------------------------------------------------------------

    mt19937 rng(123456789);

    for (int i = 0; i < 100000; ++i) {
        uint32_t id = rng() % STATE_COUNT;

        Cube a = decode(id);
        uint32_t restored = encode(a);

        assert(id == restored);
    }

    cout << "  encode/decode: OK\n";

    // ------------------------------------------------------------
    // Every quarter turn four times is identity.
    // ------------------------------------------------------------

    for (int m = 0; m < MOVE_COUNT; ++m) {
        Cube identity = power(moves[m], 4);

        for (int i = 0; i < 8; ++i) {
            assert(identity.cp[i] == i);
            assert(identity.co[i] == 0);
        }
    }

    cout << "  move^4 = identity: OK\n";

    // ------------------------------------------------------------
    // Move followed by its inverse is identity.
    // ------------------------------------------------------------

    for (int m = 0; m < MOVE_COUNT; ++m) {
        Cube identity = multiply(
            moves[INVERSE_MOVE[m]],
            moves[m]
        );

        for (int i = 0; i < 8; ++i) {
            assert(identity.cp[i] == i);
            assert(identity.co[i] == 0);
        }
    }

    cout << "  move inverse pairs: OK\n";

    // ------------------------------------------------------------
    // 24 whole-cube orientations.
    // ------------------------------------------------------------

    vector<Cube> orientations = makeSolvedOrientations();

    assert(orientations.size() == 24);

    vector<uint32_t> ids;

    for (const Cube& c : orientations) {
        uint32_t id = encode(c);

        assert(
            find(ids.begin(), ids.end(), id) == ids.end()
        );

        ids.push_back(id);

        int twistSum = 0;

        for (uint8_t x : c.co) {
            twistSum += x;
        }

        assert(twistSum % 3 == 0);
    }

    cout << "  solved orientations = 24: OK\n";

    // ------------------------------------------------------------
    // Coordinate transition tables.
    // ------------------------------------------------------------

    CoordinateTables tables =
        buildCoordinateTables(moves);

    for (int m = 0; m < MOVE_COUNT; ++m) {
        for (int i = 0; i < 1000; ++i) {
            int p = rng() % PERM_COUNT;
            int o = rng() % ORI_COUNT;

            uint32_t id =
                static_cast<uint32_t>(p * ORI_COUNT + o);

            Cube state = decode(id);

            Cube moved;
            moved.cp = {};
            moved.co = {};

            for (int j = 0; j < 8; ++j) {
                moved.cp[j] =
                    state.cp[moves[m].cp[j]];

                moved.co[j] = static_cast<uint8_t>(
                    (state.co[moves[m].cp[j]] +
                     moves[m].co[j]) % 3
                );
            }

            uint32_t expected = encode(moved);

            uint32_t actual =
                static_cast<uint32_t>(
                    tables.cpNext[m][p] * ORI_COUNT
                    + tables.coNext[m][o]
                );

            assert(expected == actual);
        }
    }

    cout << "  coordinate transition tables: OK\n";

    cout << "All tests passed.\n";
}

void runBFS(
    const filesystem::path& outputDirectory,
    int depthLimit
) {
    const auto startTime = chrono::steady_clock::now();

    const auto moves = makeMoves();

    cout << "Building coordinate transition tables...\n";

    CoordinateTables tables =
        buildCoordinateTables(moves);

    cout << "Generating 24 solved orientations...\n";

    vector<Cube> orientations =
        makeSolvedOrientations();

    if (orientations.size() != 24) {
        throw runtime_error(
            "Expected exactly 24 solved orientations."
        );
    }

    PackedNibbles bestMove(
        STATE_COUNT,
        UNVISITED
    );

    vector<uint32_t> frontier;
    vector<uint32_t> next;

    frontier.reserve(1024);
    next.reserve(1024);

    uint32_t visited = 0;

    for (const Cube& c : orientations) {
        uint32_t id = encode(c);

        if (bestMove.get(id) != UNVISITED) {
            throw runtime_error(
                "Duplicate solved orientation."
            );
        }

        bestMove.set(id, SOLVED);
        frontier.push_back(id);
        ++visited;
    }

    cout << "Initial solved states: "
         << frontier.size() << '\n';

    int depth = 0;
    int maxDepth = 0;

    while (!frontier.empty()) {
        auto now = chrono::steady_clock::now();
        double elapsed =
            chrono::duration<double>(now - startTime).count();

        cout << "depth " << setw(2) << depth
             << " | frontier " << setw(10) << frontier.size()
             << " | visited " << setw(10) << visited
             << " | time " << fixed << setprecision(1)
             << elapsed << " s\n";

        if (depthLimit >= 0 && depth >= depthLimit) {
            break;
        }

        next.clear();

        for (uint32_t id : frontier) {
            uint32_t cp =
                id / ORI_COUNT;

            uint32_t co =
                id - cp * ORI_COUNT;

            for (int m = 0; m < MOVE_COUNT; ++m) {
                uint32_t nextId =
                    static_cast<uint32_t>(
                        tables.cpNext[m][cp] * ORI_COUNT
                        + tables.coNext[m][co]
                    );

                if (bestMove.get(nextId) != UNVISITED) {
                    continue;
                }

                // We discovered nextId from id by move m.
                // Therefore the optimal move from nextId
                // toward the solved set is inverse(m).
                bestMove.set(
                    nextId,
                    INVERSE_MOVE[m]
                );

                next.push_back(nextId);
                ++visited;
            }
        }

        if (!next.empty()) {
            maxDepth = depth + 1;
        }

        frontier.swap(next);
        ++depth;
    }

    cout << '\n';
    cout << "BFS finished.\n";
    cout << "Visited: " << visited << " / "
         << STATE_COUNT << '\n';
    cout << "Max distance reached: "
         << maxDepth << '\n';

    if (depthLimit < 0) {
        if (visited != STATE_COUNT) {
            throw runtime_error(
                "Full BFS did not reach every legal state."
            );
        }

        if (maxDepth != 14) {
            throw runtime_error(
                "Unexpected QTM diameter. Expected 14."
            );
        }

        filesystem::create_directories(outputDirectory);

        filesystem::path bin =
            outputDirectory / "optimal_move.bin";

        filesystem::path metadata =
            outputDirectory / "optimal_move.json";

        write3BitFile(bin, bestMove);

        writeMetadata(
            metadata,
            visited,
            maxDepth
        );

        cout << "Output is ready.\n";
    }
}

void printUsage() {
    cout <<
        "Usage:\n"
        "  cube_precompute --test\n"
        "  cube_precompute\n"
        "  cube_precompute --depth N\n"
        "\n"
        "Default: full BFS and output generation.\n"
        "--depth N is useful for debugging and stops after layer N.\n";
}

int main(int argc, char** argv) {
    try {
        bool test = false;
        int depthLimit = -1;

        for (int i = 1; i < argc; ++i) {
            string arg = argv[i];

            if (arg == "--test") {
                test = true;
            } else if (arg == "--depth") {
                if (i + 1 >= argc) {
                    printUsage();
                    return 1;
                }

                depthLimit = stoi(argv[++i]);

                if (depthLimit < 0) {
                    throw runtime_error(
                        "--depth must be non-negative."
                    );
                }
            } else if (arg == "--help" || arg == "-h") {
                printUsage();
                return 0;
            } else {
                cerr << "Unknown argument: " << arg << '\n';
                printUsage();
                return 1;
            }
        }

        if (test) {
            runTests();
            return 0;
        }

        runBFS(
            filesystem::path("output"),
            depthLimit
        );

        return 0;
    } catch (const exception& e) {
        cerr << "ERROR: " << e.what() << '\n';
        return 1;
    }
}
