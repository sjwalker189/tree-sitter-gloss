

(constant_declaration
  name: (identifier) @constant
)
(identifier) @variable

((identifier) @variable.builtin
 (#eq? @variable.builtin "self")
 (#set! "priority" 105))

((identifier) @constant
 (#match? @constant "^[A-Z][A-Z0-9_]*$"))

; A capitalized name lexes as `type_identifier`, so the catch-all `(type_identifier)
; @type` below matches it too — and at equal priority the *later* pattern wins, which
; would make every rule in this section lose to it. Raising the priority of the specific
; captures is what keeps them, and does so without depending on where they sit in the
; file.

; Enums
(enum_variant
  name: (type_identifier) @constant
  (#set! "priority" 105))

; Unions
(union_variant
  name: (type_identifier) @constant
  (#set! "priority" 105))

(field_declaration
  name: (identifier) @variable.member
)

; An attribute schema declares the names it accepts, so a field name may be compound
; (`aria-hidden`, `@click`) or quoted (`"x-transition:enter"`) — see the grammar's
; compound_field_name. Highlighted as a member either way; the quoted form is a name,
; not a string value, and colouring it as a string would misread it.
(field_declaration
  name: (compound_field_name) @variable.member
)

(field_declaration
  name: (string) @variable.member
)

(field_value
  name: (identifier) @variable.member
)

; Functions
(function_declaration
  name: (identifier) @function
)

; A component is an ordinary function with a capitalized name, so its name lexes as
; `type_identifier`. Without this it fell through to the catch-all and every component
; declaration was coloured as a type.
(function_declaration
  name: (type_identifier) @function
  (#set! "priority" 105))

(parameter_declaration
  name: (identifier) @variable.parameter
)


(member_expression
    property: (property_identifier) @property
)

(composite_literal
  type: (identifier) @type
)

(call_expression
  function: (identifier) @function.call)

; Same for calling one — including a union variant constructor, `Circle(5)`, which the
; grammar cannot tell apart from any other capitalized call.
(call_expression
  function: (type_identifier) @function.call
  (#set! "priority" 105))

(call_expression
  function: (member_expression
    property: (property_identifier) @function.method.call))

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

(tuple_type
  (identifier) @type
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
[
  "use"
  "let"
  "const"
  "enum"
  "union"
  "struct"
  "type"
  "renderer"
  "element"
] @keyword
[ "if" "else" "match"] @keyword.conditional
[ "loop" "for" "while" ] @keyword.repeat
[ "in" ] @keyword.operator
[ "extern" "mut" ] @keyword.modifier

(visibility_modifier) @keyword.modifier
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
  "?."
] @operator

; A tag name is a tag whatever its case: `<div>` is an intrinsic element and
; `<Section>` a component, and both read as markup here. The capitalized form lexes as
; `type_identifier`, so without these it would take the catch-all's @type.
(jsx_opening_element name: (_) @tag)
(jsx_closing_element name: (_) @tag)
(jsx_self_closing_element name: (_) @tag)

; A dotted tag, `<UI.Button />`. The rules above capture the whole `member_expression`,
; but its *parts* are nodes too and their own captures — @type for `UI`, @property for
; `Button` — paint over the outer one at their narrower ranges. Recapturing the parts as
; @tag is what keeps a dotted tag looking like one tag rather than a field access.
(jsx_opening_element
  name: (member_expression (type_identifier) @tag (property_identifier) @tag)
  (#set! "priority" 105))
(jsx_closing_element
  name: (member_expression (type_identifier) @tag (property_identifier) @tag)
  (#set! "priority" 105))
(jsx_self_closing_element
  name: (member_expression (type_identifier) @tag (property_identifier) @tag)
  (#set! "priority" 105))
(jsx_attribute name: (identifier) @tag.attribute)
(jsx_attribute name: (compound_attribute_name) @tag.attribute)
(jsx_text) @none

; Treat blank identifiers like comments
((identifier) @comment
 (#eq? @comment "_"))

; --- Identifiers (fallback) ---
; (identifier) @variable.reference
