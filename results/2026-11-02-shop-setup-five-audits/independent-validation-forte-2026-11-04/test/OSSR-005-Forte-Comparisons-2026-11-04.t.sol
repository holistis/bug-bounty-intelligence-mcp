// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Float128} from "../src/Float128.sol";
import {packedFloat} from "../src/Types.sol";

contract OSSR005ForteComparisons is Test {

    function equalValues()
        internal
        pure
        returns (packedFloat l, packedFloat m)
    {
        l = Float128.toPackedFloat(int256(10**71), -71);
        m = Float128.toPackedFloat(1, 0);

        (int256 lm, int256 le) = Float128.decode(l);
        (int256 mm, int256 me) = Float128.decode(m);

        // Confirm both encodings represent exactly 1.
        assertEq(lm, mm * int256(10**34));
        assertEq(le, me - 34);

        assertTrue(packedFloat.unwrap(l) != packedFloat.unwrap(m));
    }

    function test_H6_001_RawEqualityMismatch() public {
        (packedFloat l, packedFloat m) = equalValues();

        bool actual = Float128.eq(l, m);

        emit log_named_string("Numeric equality", "1 == 1");
        emit log_named_string("Expected eq", "true");
        emit log_named_uint("Actual eq", actual ? 1 : 0);

        // Reproduce the known H-04 behavior.
        assertFalse(actual);
    }

    function test_H8_001_NonStrictComparisons() public {
        (packedFloat l, packedFloat m) = equalValues();

        bool leLM = Float128.le(l, m);
        bool leML = Float128.le(m, l);
        bool geLM = Float128.ge(l, m);
        bool geML = Float128.ge(m, l);

        emit log_named_uint("L <= M", leLM ? 1 : 0);
        emit log_named_uint("M <= L", leML ? 1 : 0);
        emit log_named_uint("L >= M", geLM ? 1 : 0);
        emit log_named_uint("M >= L", geML ? 1 : 0);

        // All four should mathematically be true.
        // Reproduce the suspected incorrect behavior.
        assertFalse(leLM);
        assertFalse(leML);
        assertFalse(geLM);
        assertFalse(geML);
    }
}
