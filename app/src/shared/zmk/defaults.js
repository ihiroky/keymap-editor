export const keymapTemplate = `
/*
 * Copyright (c) 2020 The ZMK Contributors
 *
 * SPDX-License-Identifier: MIT
 */


/* THIS FILE WAS GENERATED!
 *
 * This file was generated automatically. You may or may not want to
 * edit it directly.
 */

#include <behaviors.dtsi>
{{behaviour_includes}}

{{rendered_behavior_overrides}}

/ {
{{rendered_combo_definitions}}
{{rendered_macro_definitions}}
{{rendered_behavior_definitions}}
    keymap {
        compatible = "zmk,keymap";

{{rendered_layers}}
    };
};
`
