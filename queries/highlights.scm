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
  label: (labeled_identifier
    (identifier) @variable.parameter
  )
)


(labeled_identifier
  ":" @punctuation.muted)


; --- Types ---
(type_literal) @type.builtin
(type_identifier) @type
(type_parameter) @type.definition
(generic_type
  (identifier) @type
)

; --- Literals ---
(boolean) @boolean
(string) @string
(comment) @comment @spell

(int_literal) @number
(float_literal) @float


; --- Keywords & Operators ---

(visibility) @keyword.modifier

[
  "let"
  "enum"
  "union"
  "struct"
  "return"
  "if"
  "else"
] @keyword

"fn" @keyword.function

["=" ":" "," "<" ">" "(" ")" "[" "]" "{" "}" "+" "-" "*" "/"] @punctuation.bracket


; --- Identifiers (fallback) ---
; (identifier) @variable.reference
