cmake_minimum_required(VERSION 3.20)

project(cube_precompute LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(cube_precompute main.cpp)

if (MSVC)
    target_compile_options(cube_precompute PRIVATE /O2)
else()
    target_compile_options(cube_precompute PRIVATE -O3 -march=native)
endif()
