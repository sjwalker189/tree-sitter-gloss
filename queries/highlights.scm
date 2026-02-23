; Enums
(enum_variant
  name: (identifier) @constant)

; Unions
(union_variant
  name: (identifier) @constant
)

(field_declaration
  name: (identifier) @variable.member
)

; Functions
(function_declaration
  name: (identifier) @function
)

(parameter_declaration
  name: (identifier) @variable.parameter
)

(function_declaration
  name: (identifier) @function)

(member_expression
    property: (property_identifier) @variable.property
)

(call_expression
  function: (expression (identifier) @function.call))

(call_expression
  function: (expression 
    (member_expression
      property: (property_identifier) @function.method.call)))

(labeled_argument
  label: (identifier) @variable.parameter)

(labeled_argument
  ":" @punctuation.muted)

(punned_argument
  label: (identifier) @variable.parameter
)

(punned_argument
  ":" @punctuation.muted)


; --- Types ---
(primitive_type) @type.builtin
(type_identifier) @type

; --- Literals ---
(number) @number
(boolean) @boolean
(string) @string
(comment) @comment @spell
; (int_literal) @number
; (float_literal) @float


; --- Keywords & Operators ---

(visibility_modifier) @keyword.modifier

[
  "let"
  "const"
  "enum"
  "union"
  "struct"
  ; "if"
  ; "else"
  ; "loop"
  ; "break"
  ; "continue"
] @keyword

"fn" @keyword.function
"return" @keyword.return

["=" ":" "," "<" ">" "(" ")" "[" "]" "{" "}" ] @punctuation.bracket


; --- Identifiers (fallback) ---
; (identifier) @variable.reference
; "+" "-" "*" "/"
