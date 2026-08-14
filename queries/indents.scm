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
  ;; `continue (a, b,)` wrapped over lines. Its parentheses are not a named list the way an
  ;; argument list is, so nothing gave the values inside a level and the formatter gave them one —
  ;; a disagreement found by `script/check-indents` on the first file in the library to wrap one.
  ;; The node spans the closing paren, so the branch rule below dedents it back out, exactly as it
  ;; does for an element.
  (continue_expression)
  ;; A `where` clause indents its predicates, and it is the one container here with no delimiter
  ;; at all — the `{` that follows belongs to the body, not to the clause. So the node has to be
  ;; the clause itself, and it ends at the last predicate rather than spanning that brace, which
  ;; is why the brace needs no dedent: nothing put it inside anything.
  (where_clause)
] @indent.begin

; A binary expression wrapped over several lines hangs its continuations one level in. The
; formatter does not reflow, so every one of these was wrapped by hand and the convention is
; the author's -- but it is the convention every file in the repo uses, and without this rule
; `=` flattens all of them.
(binary_expression) @indent.begin

; A method chain wrapped over lines hangs its continuations one level in, for the same reason and
; by the same authority: `Builder::new()` ends a line with `)`, which the formatter does not treat
; as a terminator, so it indents what follows. Nothing here did, so a chain came back four columns
; short.
;
; `field_expression` rather than `call_expression`, because the receiver is what the `.` hangs off
; and it is the node that spans every line of the chain. Arguments are unaffected: they get their
; level from `argument_list`, and a chain on one line has no interior line to indent.
(field_expression) @indent.begin

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
