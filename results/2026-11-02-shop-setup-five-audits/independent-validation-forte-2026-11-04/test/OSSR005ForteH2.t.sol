// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {Float128} from "../src/Float128.sol";
import {packedFloat} from "../src/Types.sol";

contract OSSR005ForteH2 is Test {
    uint256 constant L_FLAG = uint256(1) << 241;

    function inputs() internal pure
        returns (packedFloat a, packedFloat b)
    {
        a = Float128.toPackedFloat(
            int256(10**71 + 10**67), -40
        );
        b = Float128.toPackedFloat(
            int256(10**71), -40
        );
    }

    function checkResult(packedFloat result) internal {
        uint256 raw = packedFloat.unwrap(result);

        (int256 mantissa, int256 exponent) =
            Float128.decode(result);

        emit log_named_uint("Packed result", raw);
        emit log_named_int("Mantissa", mantissa);
        emit log_named_int("Exponent", exponent);
        emit log_named_uint("L flag", raw & L_FLAG);

        assertEq(mantissa, int256(10**71));
        assertEq(exponent, -44);

        // Demonstrates the suspected missing flag.
        assertEq(raw & L_FLAG, 0);
    }

    function test_H2_001_SubMissingFlag() public {
        (packedFloat a, packedFloat b) = inputs();

        assertTrue(packedFloat.unwrap(a) & L_FLAG != 0);
        assertTrue(packedFloat.unwrap(b) & L_FLAG != 0);

        packedFloat result = Float128.sub(a, b);
        checkResult(result);
    }

    function test_H2_002_AddOppositeSigns() public {
        (packedFloat a,) = inputs();

        packedFloat negativeB = Float128.toPackedFloat(
            -int256(10**71), -40
        );

        packedFloat result = Float128.add(a, negativeB);
        checkResult(result);
    }

    function test_H2_003_DownstreamMultiplication() public {
        (packedFloat a, packedFloat b) = inputs();

        packedFloat result = Float128.sub(a, b);
        packedFloat one = Float128.toPackedFloat(1, 0);

        packedFloat product = Float128.mul(result, one);

        (int256 mantissa, int256 exponent) =
            Float128.decode(product);

        emit log_named_int("Product mantissa", mantissa);
        emit log_named_int("Product exponent", exponent);

        // Diagnostic only. Do not presume that
        // downstream corruption has been established.
    }
}
