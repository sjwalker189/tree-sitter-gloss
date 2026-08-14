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

; `/// what it does`, which the compiler attaches to the declaration below it. Not a separate
; token — see the grammar — so the prefix is matched here. A fourth slash is a ruled line and
; documents nothing, which is what the `[^/]` refuses.
((comment) @comment.documentation
  (#match? @comment.documentation "^///([^/].*)?$"))

(comment) @comment @spell

(string) @string
(escape_sequence) @string.escape
(integer_literal) @number
(float_literal) @number.float
(boolean_literal) @boolean

; --- types and constructors ------------------------------------------------------------

; The types the compiler provides. Uppercase like any other type, so nothing lexical tells
; them apart from a user's own and the list has to be written out — which is the one place
; this file guesses. A program declaring its own `Str` would be coloured wrong here and
; correctly by the language server, which reads the resolution rather than the spelling.
((type_identifier) @type.builtin
  (#any-of? @type.builtin "Int" "Bool" "Float" "Str" "Builder" "Array" "Unit"))

; Every other uppercase name. `Option`, `Cons` and a user's own `Point` are the same kind of
; thing to the lexer, so they are the same thing here.
(type_identifier) @type

; The exception to the case rule, and the only one: the sized integers are written `i8` and
; `u32`. They are ordinary names rather than keywords — `let u8 = 5;` binds a variable — so
; nothing lexical marks them, and what makes this one a type is that it stands in type
; position. No *user* type can appear here in lowercase, because `struct`, `enum` and `trait`
; all take an uppercase name, so anything this matches is one of the eight builtins.
(named_type name: (identifier) @type.builtin)

; A constructor in a pattern or an expression is a value, and reads better as one.
(path_pattern (type_identifier) @constructor .)
(tuple_struct_pattern type: (path_pattern (type_identifier) @constructor .))

(struct_literal type: (type_identifier) @constructor)

; A constant's *declaration*, which is the one place its name can be told from a type's
; without resolving anything. A use of it cannot be — `MAX` and `Option` lex identically — so
; the rule above colours it as a type and the language server corrects it, exactly as it does
; for a program that declares its own `Str`.
(const_item name: (type_identifier) @constant)

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

; A `use` path names directories, and the alias it binds is another name for one. The
; uppercase segment where a package path stops is a type, and the rule below already colours
; it — so only the lowercase run is a module here.
(use_path (identifier) @module)
(use_alias name: (identifier) @module)
; `self` and `super` are roots rather than values, whatever else they mean elsewhere.
(use_path ["self" "super"] @module.builtin)
; What a group or a single-item path takes *out* of a package is an ordinary name.
(use_tree_member name: (identifier) @variable)
(use_tree_member name: (type_identifier) @type)

; The qualifier in `html::Doc`. Only the lowercase form is a package: an uppercase one is
; `Self::Item`, a projection through a bound, and the type rule below already colours it.
(named_type qualifier: (identifier) @module)
(bound package: (identifier) @module)

; `Iterator<Item = Int>` — the name on the left of the `=` is the trait's, not a type here.
(assoc_binding name: (type_identifier) @property)

; --- calls -----------------------------------------------------------------------------

; The functions the runtime provides, for operations the language cannot express. Listed from
; `Builtin::from_name` in the compiler, and matched by shape where the compiler matches by
; shape — the sized conversions and wrapping arithmetic are generated per type rather than
; enumerated.
;
; A user function of the same name *shadows* one, and this cannot see that: the check is a
; name, where the compiler has a resolution. The language server sends the right answer, and
; this is what a file opened without one gets.
((call_expression
   function: (identifier) @function.builtin)
  (#any-of? @function.builtin
    "panic"
    "builder_new" "builder_with_capacity" "builder_push" "builder_push_slice"
    "builder_push_int" "builder_finish"
    "str_len" "str_byte" "int_to_str" "float_to_str" "float_from_int" "float_trunc"
    "array_new" "array_push" "array_set" "array_get" "array_len"
    "io_write" "io_write_err" "io_read_line"
    "fs_read" "fs_write" "fs_exists"
    "time_millis" "time_nanos"
    "env_args" "env_var"
    "task_spawn" "task_spawn_handle" "task_join" "task_run_all" "task_yield" "task_sleep"
    "task_cancel" "task_cancelled" "task_parallel" "task_worker"
    "chan_new" "chan_send" "chan_recv" "chan_close"
    "net_listen" "net_accept" "net_read" "net_write" "net_close" "net_connect"
    "ctx_within" "ctx_remaining" "ctx_allows" "ctx_cancelled" "ctx_denied" "ctx_provide"
    "ctx_find"))

((call_expression
   function: (identifier) @function.builtin)
  (#match? @function.builtin
    "^(int_to_[iu](8|16|32|64)|[iu](8|16|32|64)_(to_int|wrapping_(add|sub|mul)))$"))

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

; A hole in a string is code, not string content — so its punctuation reads as punctuation and
; whatever is inside it is highlighted by every rule in this file. Without this the braces take the
; string colour and a reader cannot see where the text stops.
(string_interpolation ["{" "}"] @punctuation.special)

; --- attributes ------------------------------------------------------------------------
;
; `@derive(Eq, Ord)`. The name reads as an attribute rather than as a function, and its arguments
; are trait names — which the rule above has already coloured as types, correctly: `Eq` *is* one.
(attribute "@" @attribute)
(attribute name: (identifier) @attribute)

; --- keywords --------------------------------------------------------------------------

[
  "fn"
  "let"
  "const"
  "struct"
  "enum"
  "trait"
  "type"
  "test"
  "impl"
  "elements"
  "element"
  ; Contextual in the compiler's lexer, and highlighted unconditionally here — the grammar only
  ; admits it in the one position where it is the keyword, so a variable named `where` is not
  ; this token.
  "where"
] @keyword

; `text_declaration` *is* the `text` token — the rule has no other content — so it is captured
; as a node rather than as an anonymous keyword.
(text_declaration) @keyword

[
  "package"
  "use"
] @keyword.import

[
  "pub"
  "view"
  "pure"
  "linear"
  "mut"
] @keyword.modifier

[
  "if"
  "else"
  "match"
  "loop"
  "while"
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
