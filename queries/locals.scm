; (block) @local.scope
;
; (let_statement name: (identifier) @local.definition)
; (parameter name: (identifier) @local.definition)
;
; (identifier) @local.reference
;
;
; ; Define what nodes create a new lexical scope
; [
;   (function_definition)
;   (block)
;   (struct_body)
; ] @local.scope
;
; ; Define where names are introduced (Definitions)
; (function_definition name: (identifier) @local.definition)
; (parameter name: (identifier) @local.definition)
; (type_parameter name: (identifier) @local.definition)
; (let_statement name: (identifier) @local.definition)
;
; ; Define where names are consumed (References)
; (identifier) @local.reference
