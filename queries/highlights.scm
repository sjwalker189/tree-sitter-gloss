; Enums
(enum_definition name: (identifier) @type.definition)
(enum_member
  name: (property_identifier (identifier)) @constant)

; Unions
(union_definition name: (identifier) @type.definition)
(union_field
  name: (identifier) @constant
)

; Structs
(struct_definition
  name: (identifier) @type.definition
)

(struct_field
  name: (identifier) @variable.member
)

(struct_expression
  name: (_) @type
)

(field_initializer
  name: (identifier) @variable.member  
)

; Functions
(function_definition
  name: (identifier) @function
)


(parameter
  name: (identifier) @variable.parameter
)

(type_parameters
  (type_parameter
    name: (identifier) @type
  )
)

(call_expression
  name: (identifier) @function.call)

(labeled_function_argument
  label: (identifier) @variable.parameter)

(labeled_function_argument
  ":" @punctuation.muted)

(labeled_function_argument_punned
  label: (identifier) @variable.parameter)
;
; (labeled_function_argument_punned
;   ":" @punctuation.muted)
;

; --- Types ---
(type_literal) @type.builtin
(type_identifier) @type
(type_parameter) @type.definition

; --- Literals ---
(boolean) @boolean
(number) @number
(string) @string
(comment) @comment @spell


; --- Keywords & Operators ---

[
  "fn"
  "let"
  "enum"
  "union"
  "struct"
  "return"
] @keyword

["=" ":" "," "<" ">" "(" ")" "{" "}" "+" "-" "*" "/"] @punctuation.bracket


; --- Identifiers (fallback) ---
; (identifier) @variable.reference
