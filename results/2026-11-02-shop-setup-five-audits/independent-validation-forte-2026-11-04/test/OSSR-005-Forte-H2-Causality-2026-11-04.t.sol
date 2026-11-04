// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Float128} from "../src/Float128.sol";
import {packedFloat} from "../src/Types.sol";

contract OSSR005ForteH2Causality is Test {
    uint256 constant L_FLAG = uint256(1) << 241;

    function assertRepresents10Power27(
        packedFloat value
    ) internal pure {
        (int256 m, int256 e) = Float128.decode(value);

        require(e >= -49 && e <= 27, "Exponent outside test range");
        assertEq(m, int256(10 ** uint256(27 - e)));
    }

    function test_H2_004_MissingFlagCausesWrongProduct() public {
        packedFloat a = Float128.toPackedFloat(
            int256(10**71 + 10**67), -40
        );
        packedFloat b = Float128.toPackedFloat(
            int256(10**71), -40
        );
        packedFloat one = Float128.toPackedFloat(1, 0);

        packedFloat broken = Float128.sub(a, b);

        assertEq(packedFloat.unwrap(broken) & L_FLAG, 0);
        assertRepresents10Power27(broken);

        packedFloat wrongProduct = Float128.mul(broken, one);
        (int256 wrongM, int256 wrongE) =
            Float128.decode(wrongProduct);

        emit log_named_int("Wrong product mantissa", wrongM);
        emit log_named_int("Wrong product exponent", wrongE);

        // Correct numerical result would be 10^27.
        assertTrue(
            wrongE < -49 ||
            wrongE > 27 ||
            wrongM != int256(10 ** uint256(27 - wrongE)),
            "Unexpected: unflagged product is correct"
        );

        // Change only the missing representation bit.
        packedFloat corrected = packedFloat.wrap(
            packedFloat.unwrap(broken) | L_FLAG
        );

        assertRepresents10Power27(corrected);

        packedFloat correctedProduct =
            Float128.mul(corrected, one);

        (int256 fixedM, int256 fixedE) =
            Float128.decode(correctedProduct);

        emit log_named_int("Corrected product mantissa", fixedM);
        emit log_named_int("Corrected product exponent", fixedE);

        assertRepresents10Power27(correctedProduct);
    }
}
