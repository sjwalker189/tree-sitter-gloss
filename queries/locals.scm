; Scopes and bindings, for rename and for highlighting a use the same colour as its
; definition.
;
; Gloss has no mutation, so every binding here is introduced once and never reassigned — a
; `let` shadows rather than updates, and a loop's carried values are rebound by `continue`
; rather than assigned to. That makes the scope graph unusually simple: definitions only ever
; appear in the four places below.

(block) @local.scope
(function_item) @local.scope
(lambda_expression) @local.scope
(match_arm) @local.scope
(loop_expression) @local.scope

(parameter name: (identifier) @local.definition.parameter)
(let_statement name: (identifier) @local.definition.var)
(binding_pattern (identifier) @local.definition.var)

; A loop's carried values are bindings of the loop, not of the block inside it: they are in
; scope in the body and gone after `break`.
(loop_binding name: (identifier) @local.definition.var)

(function_item name: (identifier) @local.definition.function)

(identifier) @local.reference
