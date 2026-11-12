// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Float128} from "../src/Float128.sol";
import {packedFloat} from "../src/Types.sol";

contract OSSR005ForteExponentBoundaries is Test {
    int256 constant L_MANTISSA = int256(10**71);

    function check(
        int256 inputExponent,
        int256 expectedDecodedExponent
    ) internal {
        packedFloat value = Float128.toPackedFloat(
            L_MANTISSA, inputExponent
        );

        (int256 mantissa, int256 decodedExponent) =
            Float128.decode(value);

        emit log_named_int("Input exponent", inputExponent);
        emit log_named_int("Decoded exponent", decodedExponent);
        emit log_named_int("Decoded mantissa", mantissa);

        assertEq(mantissa, L_MANTISSA);
        assertEq(decodedExponent, expectedDecodedExponent);
    }

    function test_H9_001_ValidUpperBoundary() public {
        check(8191, 8191);
    }

    function test_H9_002_ValidLowerBoundary() public {
        check(-8192, -8192);
    }

    function test_H9_003_UpperBoundaryWraps() public {
        check(8192, -8192);
    }

    function test_H9_004_LowerBoundaryWraps() public {
        check(-8193, 8191);
    }
}
