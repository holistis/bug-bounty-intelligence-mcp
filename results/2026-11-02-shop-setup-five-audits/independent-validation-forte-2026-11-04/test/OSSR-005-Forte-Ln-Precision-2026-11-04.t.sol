// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Float128} from "../src/Float128.sol";
import {Ln} from "../src/Ln.sol";
import {packedFloat} from "../src/Types.sol";

contract OSSR005ForteLnPrecision is Test {
    function test_H7_001_LosesDistinctInput() public {
        uint256 base = 10**71;
        uint256 delta = 10**31;

        packedFloat one = Float128.toPackedFloat(
            int256(base), -71
        );

        packedFloat aboveOne = Float128.toPackedFloat(
            int256(base + delta), -71
        );

        assertTrue(
            packedFloat.unwrap(one) !=
            packedFloat.unwrap(aboveOne)
        );

        (int256 m1, int256 e1) = Float128.decode(one);
        (int256 m2, int256 e2) = Float128.decode(aboveOne);

        assertEq(e1, -71);
        assertEq(e2, -71);
        assertEq(m2 - m1, int256(delta));

        uint256 truncated1 = uint256(m1) / 10**34;
        uint256 truncated2 = uint256(m2) / 10**34;

        assertEq(truncated1, truncated2);

        emit log_named_uint("Truncated input 1", truncated1);
        emit log_named_uint("Truncated input 2", truncated2);

        packedFloat lnOne = Ln.ln(one);
        packedFloat lnAboveOne = Ln.ln(aboveOne);

        (int256 resultM1, int256 resultE1) =
            Float128.decode(lnOne);

        (int256 resultM2, int256 resultE2) =
            Float128.decode(lnAboveOne);

        emit log_named_int("ln(1) mantissa", resultM1);
        emit log_named_int("ln(1) exponent", resultE1);
        emit log_named_int("ln(1+1e-40) mantissa", resultM2);
        emit log_named_int("ln(1+1e-40) exponent", resultE2);

        // The two inputs are different but their
        // significant difference is discarded.
        assertEq(
            packedFloat.unwrap(lnOne),
            packedFloat.unwrap(lnAboveOne)
        );
    }
}
