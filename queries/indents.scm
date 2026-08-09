; Indentation for Gloss.
;
; There was no `indents.scm` at all, which does not mean "fall back to something sensible" —
; nvim-treesitter's `indentexpr` is set for every filetype, so with no query it answers 0 and
; `==` inside a struct body left the field at column 0.
;
; The oracle is `gloss fmt`. A formatted file re-indented with `gg=G` must come back
; unchanged, over every file in the compiler repo; `script/check-indents` asserts exactly
; that. This is the same shape of property the formatter itself is built on — the parser
; guarantees `reconstruct(tree) == source`, so both ends have something exact to check against
; rather than a rule someone eyeballed.

; --- containers ---------------------------------------------------------------------------
;
; Everything that opens a brace, and the two that open a paren or an angle. Listing the *body*
; nodes rather than their parents is what makes the closing delimiter land at the parent's
; level: the branch rule below dedents it back out of the body it terminates.

[
  (block)
  (field_list)
  (variant_list)
  (trait_body)
  (impl_body)
  (match_arm_list)
  (field_initializer_list)
  (attribute_record)
  (elements_item)
  (argument_list)
  (parameter_list)
  (parameter_type_list)
  (type_parameters)
  (type_arguments)
  (assoc_bindings)
  (loop_header)
] @indent.begin

; A binary expression wrapped over several lines hangs its continuations one level in. The
; formatter does not reflow, so every one of these was wrapped by hand and the convention is
; the author's -- but it is the convention every file in the repo uses, and without this rule
; `=` flattens all of them.
(binary_expression) @indent.begin

; An element's children indent between the tags.
;
; The capture is the whole `element` and *not* `element_children`, which is the obvious choice
; and is wrong: the children node ends before the closing tag, so it is not an ancestor of
; `</div>`, and the branch rule below would dedent that line out of a level nothing had added
; -- putting the close tag at column 0. The `element` node spans both tags, so it is an
; ancestor of the closing one, and the two rules then cancel exactly.
(element) @indent.begin

; --- closing delimiters -------------------------------------------------------------------
;
; A line *starting* with one of these belongs to the enclosing level, not the enclosed one.
;
; `>` is deliberately absent. It closes `type_arguments` and an element's open tag, but it is
; also the greater-than operator, and a line beginning with a comparison would dedent itself
; for no reason. `</` and `/>` are unambiguous because nothing else spells them.

[
  "}"
  ")"
  "</"
  "/>"
] @indent.branch

; --- left alone ---------------------------------------------------------------------------

; A comment keeps whatever indentation it was given. Deriving it from the tree moves a comment
; that was deliberately aligned with the line above or below it.
(comment) @indent.auto
