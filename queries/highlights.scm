; Highlighting for Gloss.
;
; The one rule that shapes everything here: **identifier case is semantic**. `[a-z_]…` is a
; value and `[A-Z]…` is a type or constructor, enforced by the lexer rather than by
; convention — which is why the language has no lowercase primitive keywords, and why `Int`
; and `Str` highlight as types without appearing in any keyword list. Nothing below needs to
; guess from context what a name is.
;
; Captures follow the nvim-treesitter naming, which Helix and Zed also read.

; --- comments and literals -------------------------------------------------------------

(comment) @comment @spell

(string) @string
(escape_sequence) @string.escape
(integer_literal) @number
(float_literal) @number.float
(boolean_literal) @boolean

; --- types and constructors ------------------------------------------------------------

; Every uppercase name. `Int`, `Option`, `Cons` and a user's own `Point` are the same kind of
; thing to the lexer, so they are the same thing here.
(type_identifier) @type

; A constructor in a pattern or an expression is a value, and reads better as one.
(path_pattern (type_identifier) @constructor .)
(tuple_struct_pattern type: (path_pattern (type_identifier) @constructor .))

(struct_literal type: (type_identifier) @constructor)

; --- declarations ----------------------------------------------------------------------

(function_item name: (identifier) @function)
(method_signature name: (identifier) @function)
(lambda_expression "fn" @keyword.function)

(parameter name: (identifier) @variable.parameter)
(self_parameter) @variable.builtin

(field_declaration name: (identifier) @property)
(field_initializer name: (identifier) @property)
(field_expression field: (identifier) @property)

(attribute_declaration name: (identifier) @property)

(type_parameter name: (type_identifier) @type.definition)

(package_declaration name: (identifier) @module)
(import_declaration alias: (identifier) @module)
(import_declaration path: (string) @string.special.path)

; The qualifier in `html::Doc`. Only the lowercase form is a package: an uppercase one is
; `Self::Item`, a projection through a bound, and the type rule below already colours it.
(named_type qualifier: (identifier) @module)
(bound package: (identifier) @module)

; `Iterator<Item = Int>` — the name on the left of the `=` is the trait's, not a type here.
(assoc_binding name: (type_identifier) @property)

; --- calls -----------------------------------------------------------------------------

(call_expression
  function: (identifier) @function.call)
(call_expression
  function: (field_expression field: (identifier) @function.method.call))
(call_expression
  function: (path_expression (identifier) @function.call .))

; --- elements --------------------------------------------------------------------------
;
; Element syntax is markup, and highlighting it as markup rather than as calls is the whole
; point of it having syntax at all.

(element_open name: (identifier) @tag)
(element_close name: (identifier) @tag)
(element_self_closing name: (identifier) @tag)
(element_attribute name: (identifier) @tag.attribute)

(element_text) @none

[
  "<"
  ">"
  "</"
  "/>"
] @tag.delimiter

; --- keywords --------------------------------------------------------------------------

[
  "fn"
  "let"
  "struct"
  "enum"
  "trait"
  "type"
  "test"
  "impl"
  "elements"
  "element"
] @keyword

; `text_declaration` *is* the `text` token — the rule has no other content — so it is captured
; as a node rather than as an anonymous keyword.
(text_declaration) @keyword

[
  "package"
  "import"
] @keyword.import

[
  "pub"
  "view"
  "linear"
] @keyword.modifier

[
  "if"
  "else"
  "match"
  "loop"
  "break"
  "continue"
  "return"
] @keyword.control

; `for` is two keywords wearing one spelling: the loop, and the `impl Show for Int` that has
; nothing to do with control flow. The node says which, so neither has to guess.
(for_expression "for" @keyword.control)
(for_expression "in" @keyword.control)
(impl_item "for" @keyword)

; --- operators and punctuation ----------------------------------------------------------

[
  "+"
  "-"
  "*"
  "/"
  "%"
  "=="
  "!="
  "<="
  ">="
  "&&"
  "||"
  "!"
  "&"
  "|"
  "^"
  "<<"
  ">>"
  "="
  "->"
  "=>"
  "?"
] @operator

[
  "("
  ")"
  "{"
  "}"
] @punctuation.bracket

[
  ","
  ":"
  "::"
  ";"
  "."
] @punctuation.delimiter

(wildcard_pattern) @character.special

; Ordinary value names, last so that everything above wins.
(identifier) @variable
