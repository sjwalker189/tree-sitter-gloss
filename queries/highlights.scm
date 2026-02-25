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

(field_value
  name: (identifier) @variable.member
)

; Functions
(function_declaration
  name: (identifier) @function
)

(parameter_declaration
  name: (identifier) @variable.member
)

(function_declaration
  name: (identifier) @function)

(member_expression
    property: (property_identifier) @property
)

(composite_literal
  type: (identifier) @type
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

(generic_type
  name: (identifier) @type
)

; --- Literals ---
(number) @number
(boolean) @boolean
(string) @string
(escape_sequence) @string.escape
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
  "if"
  "else"
  "loop"
  "while"
  "for"
  "in"
  "match"
] @keyword

(break_statement) @keyword
(continue_statement) @keyword

"fn" @keyword.function
"return" @keyword.return

[":" "," "<" ">" "(" ")" "[" "]" "{" "}" ] @punctuation.bracket

"=>" @punctuation.special
(catch_all_pattern) @variable.builtin

[
  "=="
  "!="
  "<"
  "<="
  ">"
  ">="
  "+"
  "-"
  "*"
  "/"
  "%"
  "&&" 
  "||" 
  "!"  
  "&"  
  "|" 
  "^"
  "<<"
  ">>"
  "~" 
  "="
  "+="
  "-="
  "*="
  "/="
  "%="
  "<<="
  ">>="
  "&="
  "|="
  "^="
  "++"
  "--"
] @operator

(jsx_opening_element name: (_) @tag)
(jsx_closing_element name: (_) @tag)
(jsx_self_closing_element name: (_) @tag)
(jsx_attribute name: (identifier) @tag.attribute)
(jsx_text) @none

; Treat blank identifiers like comments
((identifier) @comment
 (#eq? @comment "_"))

; --- Identifiers (fallback) ---
; (identifier) @variable.reference
