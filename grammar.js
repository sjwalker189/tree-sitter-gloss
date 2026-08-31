/**
 * Gloss — a statically typed, immutable, reference-counted language for the web.
 *
 * This grammar is derived from the compiler's own parser rather than from documentation:
 * `crates/gloss-syntax/src/kind.rs` in the `gloss-lang` repo lists every token and node kind,
 * and `parser.rs` is the grammar. Where the two could differ, the compiler is right and this
 * is wrong — the corpus under `test/corpus/` is checked against real files from that repo so
 * the divergence shows up as a failing test rather than as mis-highlighted code.
 *
 * Three things are worth knowing before reading it.
 *
 * **Identifier case is semantic.** `[a-z_]…` is a value, `[A-Z]…` is a type or constructor.
 * The language has no lowercase primitive keywords — `Int` and `Str` are ordinary names
 * resolved against a prelude — so the case distinction carries real weight and is encoded
 * here as two token rules rather than one.
 *
 * **`<` in expression position is always an element.** A `<` cannot begin a binary operator,
 * so where a value is expected it is unambiguously `<div>`, and where an operand is expected
 * it is unambiguously less-than. The compiler's parser needs no lookahead for this and
 * neither does this grammar — the LR state decides.
 *
 * **Element content is not code.** Everything between `>` and the next `<` or `{` is
 * character data, whitespace included: the space in `<p>a b</p>` is part of the document, not
 * trivia. That is why `element_text` is a single greedy token and why an external scanner
 * exists at all — `extras` would otherwise eat the leading space.
 */

const PREC = {
  // The compiler's `binary_bp`, in `kind.rs`. Rust's ordering rather than C's: comparison
  // binds tighter than the bitwise operators, so `a & b == c` is `a & (b == c)`.
  or: 1,
  and: 2,
  bitor: 3,
  bitxor: 4,
  bitand: 5,
  equality: 6,
  comparison: 7,
  shift: 8,
  additive: 9,
  multiplicative: 10,
  unary: 11,
  // Postfix `?`, `.field` and `(args)` bind tighter than any operator, so `a? + b?`
  // propagates each side before adding them.
  postfix: 12,
};

module.exports = grammar({
  name: "gloss",

  extras: ($) => [/\s/, $.comment],

  externals: ($) => [$.element_text],

  word: ($) => $.identifier,

  // A braced value in these positions opens a *body*, not a struct literal. The compiler
  // carries a `no_braced_value` flag for exactly this; here the conflict is declared and the
  // parser resolves it by lookahead, which reaches the same answer.
  conflicts: ($) => [
    [$._expression, $.struct_literal],
    // `{ .. }` at the start of a statement is a statement, not the beginning of a call or a
    // binary expression whose left operand is a block. The compiler settles this with a
    // `no_braced_value` flag; here the two readings are declared and lookahead decides.
    [$._block_like_expression, $._expression],
    // `use io::{println}` — at the `::` the parser cannot yet know whether a name, a
    // `*` or a `{` follows, so it cannot decide whether the path is finished. One token of
    // lookahead past the `::` settles it, which is what declaring the conflict buys.
    [$.use_path],
  ],

  rules: {
    source_file: ($) =>
      // A `use` may sit anywhere among the items, which is what the compiler's parser accepts
      // and is worth keeping: `use Colour::*;` written directly under the enum it globs reads
      // better than the same line hoisted to the top away from what it refers to. A package
      // is one scope regardless of order, so nothing depends on where it went.
      seq(
        optional($.package_declaration),
        repeat(choice($.use_declaration, $._item)),
      ),

    // One token for both kinds. `/// what it does` is a *doc* comment — the compiler's item
    // lowering attaches it to the declaration below — and this grammar deliberately does not
    // split it out: a separate token would have to beat `//.*` in the lexer, and lexical
    // precedence in tree-sitter overrides longest match, which makes `//// a rule` a doc
    // comment followed by wreckage. The distinction is one character of prefix and belongs in
    // a query predicate, where it costs nothing to be exact.
    comment: (_) => token(seq("//", /.*/)),

    // --- items -------------------------------------------------------------------------

    // `package html;` — checked against the directory the file sits in, so a file moved into
    // the wrong place is an error rather than a silent change of meaning.
    package_declaration: ($) => seq("package", field("name", $.identifier), ";"),

    // `use io;`, `use io::{println};`, `use Option::*;`, `use super::text as t;`
    //
    // A package is a *directory*, and the path names one: `self` is the file's own package and
    // `super` its parent, repeatable, and every other root is a package that ships with the
    // compiler. There is no manifest and so no project root to name, which is why that is the
    // whole list of roots — and why a leading name outside it is an error rather than an
    // implicit `self`.
    //
    // **Where the package prefix ends is decided lexically** — at the first uppercase name, at
    // a `{`, or at a `*` — and never by consulting what directories exist. That is why an item
    // with a lowercase name needs the braces of `use io::{println};`: both a directory and a
    // function are lowercase names, and the braces are the only thing telling them apart.
    // Nothing in this grammar has to know which is which, and neither does the reader.
    use_declaration: ($) => seq("use", field("tree", $.use_tree), ";"),

    use_tree: ($) =>
      seq(
        field("path", $.use_path),
        optional(choice($.use_glob, field("group", $.use_group))),
        optional(field("alias", $.use_alias)),
      ),

    use_path: ($) =>
      seq(
        choice($.identifier, $.type_identifier, "self", "super"),
        repeat(seq("::", choice($.identifier, $.type_identifier, "self", "super"))),
      ),

    use_glob: (_) => seq("::", "*"),

    // Flat: a member is a name and an optional alias, never another path.
    use_group: ($) =>
      seq("::", "{", commaSep($.use_tree_member), optional(","), "}"),

    use_tree_member: ($) =>
      seq(
        field("name", choice($.identifier, $.type_identifier)),
        optional(field("alias", $.use_alias)),
      ),

    use_alias: ($) =>
      seq("as", field("name", choice($.identifier, $.type_identifier))),

    // An attribute is a *sibling* of the declaration it applies to rather than its parent, which
    // is the shape the compiler's parser produces and the reason every item rule is unchanged: an
    // item does not know whether anything preceded it, and the AST layer reads an attribute by
    // looking backwards from a declaration.
    _item: ($) =>
      choice(
        $.attribute,
        $.function_item,
        $.struct_item,
        $.enum_item,
        $.trait_item,
        $.impl_item,
        $.elements_item,
        $.test_item,
        $.const_item,
      ),

    // `test "adds two numbers" { 1 + 1 == 2 }` — the label is prose, so it is a string rather
    // than an identifier: it is read in a report, not called from anywhere.
    test_item: ($) => seq("test", field("label", $.string), field("body", $.block)),

    // `@derive(Eq, Ord)`
    //
    // `@` rather than `#[..]`, matching the `@inline` and `@specialize` the foundations write —
    // and it needs no closing bracket, the arguments being parenthesised. The arguments are names
    // and nothing else: an attribute taking a value would be a second shape, and neither attribute
    // the language plans takes one.
    attribute: ($) =>
      seq(
        "@",
        field("name", $.identifier),
        optional(
          seq("(", commaSep(choice($.type_identifier, $.identifier)), optional(","), ")"),
        ),
      ),

    // `const MAX_DEPTH: Int = 10;`
    //
    // The name is a `type_identifier` because it is **uppercase**, and that is not a convention
    // here: identifier case is semantic, so an uppercase segment is where a package path stops.
    // A constant therefore lexes exactly as a type name does and sits in the same namespace as
    // a nullary constructor — which is the other uppercase name that denotes a value.
    //
    // The annotation is not optional in the compiler either. A constant is a signature, and
    // signatures are written down rather than inferred.
    const_item: ($) =>
      seq(
        optional($._modifiers),
        "const",
        field("name", $.type_identifier),
        ":",
        field("type", $._type),
        "=",
        field("value", $._expression),
        ";",
      ),

    // The run of modifiers before a declaration.
    //
    // One rule for every item rather than a list per item, and deliberately permissive: which
    // modifiers a given declaration *accepts* is the compiler's business, and it reports a
    // wrong one as a diagnostic rather than as a parse error. `linear fn` therefore parses
    // here and is rejected there, which is the right division — a parse error would replace
    // "`linear` may not precede a function" with nothing.
    //
    // It is also what keeps this LR(1): a repeat per item makes `pub` ambiguous between them
    // until the head keyword arrives.
    _modifier: (_) => choice("pub", "pure", "view", "linear", "client"),

    _modifiers: ($) => repeat1($._modifier),

    // `view` marks a function as emitting elements; `pure` marks it as reaching no ambient
    // authority. The compiler scans the run of modifiers and dispatches on what it ends at, so
    // any order of any subset parses and a repeat is a *diagnostic* rather than a parse error —
    // this mirrors that, rather than enumerating the orders.
    function_item: ($) =>
      seq(
        optional($._modifiers),
        "fn",
        // Either case. Identifier case is semantic here, so a name is ordinarily lowercase —
        // but a `view` may be capitalised, because a component is a thing rather than an action
        // and because `<Card/>` will need the capital to tell a component from a tag. The
        // compiler allows it only after `view`; accepting it here for any `fn` keeps this LR(1)
        // and leaves the restriction where the message is.
        field("name", choice($.identifier, $.type_identifier)),
        optional(field("type_parameters", $.type_parameters)),
        field("parameters", $.parameter_list),
        optional(seq("->", field("return_type", $._type))),
        optional(field("where_clause", $.where_clause)),
        field("body", $.block),
      ),

    parameter_list: ($) =>
      seq("(", commaSep(choice($.self_parameter, $.parameter)), optional(","), ")"),

    // A bare `self`, which needs no annotation because the impl block says what it is.
    self_parameter: (_) => "self",

    // The annotation is *semantically* mandatory — no cross-module inference is what lets
    // modules check in parallel and in any order — but it is optional in the grammar, exactly
    // as it is in the compiler's. Rejecting it here would replace the checker's explanation of
    // why it is required with a parse error that says nothing.
    parameter: ($) =>
      seq(field("name", $.identifier), optional(seq(":", field("type", $._type)))),

    struct_item: ($) =>
      seq(
        optional($._modifiers),
        "struct",
        field("name", $.type_identifier),
        optional(field("type_parameters", $.type_parameters)),
        optional(field("where_clause", $.where_clause)),
        // `struct Idle;` — a marker, carrying nothing. The braced form asserts there is
        // nothing between the braces; the terminator says the same in one character. Nothing
        // downstream tells them apart: a struct is a one-constructor algebraic type either
        // way, and the bare literal `Idle` is that constructor applied to no fields.
        choice(field("body", $.field_list), ";"),
      ),

    field_list: ($) => seq("{", commaSep($.field_declaration), optional(","), "}"),

    field_declaration: ($) => seq(field("name", $.identifier), ":", field("type", $._type)),

    enum_item: ($) =>
      seq(
        optional($._modifiers),
        "enum",
        field("name", $.type_identifier),
        optional(field("type_parameters", $.type_parameters)),
        optional(field("where_clause", $.where_clause)),
        field("body", $.variant_list),
      ),

    variant_list: ($) => seq("{", commaSep($.variant), optional(","), "}"),

    variant: ($) =>
      seq(field("name", $.type_identifier), optional(field("payload", $.variant_payload))),

    variant_payload: ($) => seq("(", commaSep1($._type), optional(","), ")"),

    trait_item: ($) =>
      seq(
        optional($._modifiers),
        "trait",
        field("name", $.type_identifier),
        optional(seq(":", field("supertraits", $.bound_list))),
        field("body", $.trait_body),
      ),

    trait_body: ($) =>
      seq(
        "{",
        repeat(choice($.method_signature, $.associated_type, $.function_item)),
        "}",
      ),

    // `type Item;` in a trait, `type Item = Int;` in an impl. One rule for both, because the
    // difference is only whether a value was written: the trait declares the name and the
    // impl says what it stands for.
    associated_type: ($) =>
      seq(
        "type",
        field("name", $.type_identifier),
        optional(seq("=", field("value", $._type))),
        ";",
      ),

    // `fn show(self) -> Str;` — no body. With one it is a *default*, and parses as an
    // ordinary `function_item`, because that is what it compiles to: a function generic over
    // `Self`, bounded by this trait.
    method_signature: ($) =>
      seq(
        optional($._modifiers),
        "fn",
        field("name", $.identifier),
        field("parameters", $.parameter_list),
        optional(seq("->", field("return_type", $._type))),
        ";",
      ),

    // `impl Show for Int`, or `impl<T> Array<T>` for an inherent block. Both start with a
    // type and the `for` decides which was which — the compiler parses one and looks, rather
    // than guessing, which is what lets a trait be package-qualified and a self type generic.
    impl_item: ($) =>
      seq(
        optional($._modifiers),
        "impl",
        optional(field("type_parameters", $.type_parameters)),
        field("trait", $._type),
        optional(seq("for", field("type", $._type))),
        optional(field("where_clause", $.where_clause)),
        field("body", $.impl_body),
      ),

    impl_body: ($) =>
      seq("{", repeat(choice($.associated_type, $.function_item)), "}"),

    // `elements Html { element div: Children & { class: Str } }` — a vocabulary. It becomes a
    // trait and a struct per element; nothing downstream knows it was written this way.
    // A `pure` vocabulary generates `pure` methods, so no medium implementing it may reach
    // the world — which is what makes `pure view fn` writable.
    //
    // A vocabulary may also write its methods' bodies inline, against a supertrait of its own
    // design. Those are `function_item`s, because that is what they compile to. A body ends
    // itself, so the comma after one is optional — hence the trailing-comma-per-member shape
    // rather than `commaSep`.
    elements_item: ($) =>
      seq(
        optional($._modifiers),
        "elements",
        field("name", $.type_identifier),
        optional(seq(":", field("supertraits", $.bound_list))),
        "{",
        repeat(
          seq(
            choice(
              $.text_declaration,
              $.attrs_group,
              $.element_declaration,
              $.function_item,
              $.method_signature,
            ),
            optional(","),
          ),
        ),
        "}",
      ),

    // The marker saying this vocabulary admits character data. `text` and `element` are
    // contextual: the compiler matches them by spelling here and lexes them as ordinary
    // identifiers everywhere else, so neither is reserved.
    text_declaration: (_) => "text",

    // `attrs Global { id?: Str, class?: Str }` — a named list of attributes an element may take
    // by naming it, instead of writing the same eighteen out 120 times.
    //
    // It declares no type. The group is spliced into each element's generated attribute struct
    // as ordinary fields, so a medium reads `a.class` whether the field came from a group or from
    // the element's own record, and nothing downstream knows a group existed. That is why an
    // element names one through `element_spec`'s ordinary `type_identifier` arm and there is no
    // rule here for the reference.
    attrs_group: ($) =>
      seq("attrs", field("name", $.type_identifier), field("attributes", $.attribute_record)),

    element_declaration: ($) =>
      seq(
        "element",
        field("name", $.identifier),
        optional(seq(":", field("spec", $.element_spec))),
      ),

    // `Children`, an attribute record, or both joined by `&`.
    element_spec: ($) => sep1($._element_spec_part, "&"),

    _element_spec_part: ($) => choice($.type_identifier, $.attribute_record),

    attribute_record: ($) => seq("{", commaSep($.attribute_declaration), optional(","), "}"),

    // `class?: Str` is a field of type `Option<Str>`, generated the way anyone would write
    // it — the `?` is the whole of what optional means.
    attribute_declaration: ($) =>
      seq(field("name", $.attribute_name), optional("?"), ":", field("type", $._type)),

    // `class`, `aria-label`, `http-equiv`, `type` — an attribute's name as written.
    //
    // Not an `identifier`, and the two reasons are the same two the compiler gives. HTML's names
    // hold hyphens, and they collide with keywords: `<input type="text">` and `<label for="n">`
    // are most of a form, so accepting them was not optional. Both are unambiguous *here* and
    // nowhere else, because no expression can appear in attribute-name position — so a `-` between
    // two names can only be part of one.
    //
    // **One token, where the compiler keeps the run of tokens it lexed.** The compiler has to: its
    // tree reproduces its source byte for byte, and the field name is mangled from those tokens by
    // `attribute_field_name`. This grammar exists to highlight, and a name that is one thing should
    // be one colour — the alternative colours the hyphen of `aria-label` as an operator, which is
    // the bug that sent me here.
    //
    // A token rather than a rule is also what lets a keyword through. Tree-sitter extracts keywords
    // from the `word` token, so `type` becomes the `"type"` keyword only in a state where that
    // token is valid; in attribute-name position it is not, and this matches instead. Listing the
    // keywords here would be a second copy of a list the compiler already has, which is the way
    // this grammar has drifted before.
    //
    // The one thing the compiler accepts and this does not is `aria - label`, spaced — it is the
    // same attribute written strangely, and no file writes it.
    attribute_name: (_) => token(/[A-Za-z_][A-Za-z0-9_]*(-[A-Za-z_][A-Za-z0-9_]*)*/),

    // --- generics ----------------------------------------------------------------------

    type_parameters: ($) => seq("<", commaSep1($.type_parameter), optional(","), ">"),

    type_parameter: ($) =>
      seq(field("name", $.type_identifier), optional(seq(":", field("bounds", $.bound_list)))),

    bound_list: ($) => sep1($.bound, "+"),

    // `where T: Show, U: Eq + Hash` — the same bounds, written after the header instead of
    // inside the angle brackets. Purely a second spelling: the compiler folds each predicate
    // into the parameter it names, and a test there compares the signatures the two forms build.
    //
    // `where` is contextual in the compiler's lexer — it is an ordinary name everywhere else —
    // and it is a plain string here for the same reason the other contextual keywords are: this
    // is the only position it can appear in, so no conflict arises.
    where_clause: ($) => seq("where", commaSep1($.where_predicate), optional(",")),

    where_predicate: ($) =>
      seq(field("name", $.type_identifier), ":", field("bounds", $.bound_list)),

    // `Iterator`, `html::Doc`, or `Iterator<Item = Int>` — a bound that also fixes one of the
    // trait's associated types. The angle brackets are free here because the language has no
    // generic traits, so an equation is the only thing that can stand in them.
    bound: ($) =>
      seq(
        optional(seq(field("package", $.identifier), "::")),
        field("name", $.type_identifier),
        optional(field("assoc", $.assoc_bindings)),
      ),

    assoc_bindings: ($) => seq("<", commaSep1($.assoc_binding), optional(","), ">"),

    assoc_binding: ($) =>
      seq(field("name", $.type_identifier), "=", field("value", $._type)),

    type_arguments: ($) => seq("<", commaSep1($._type), optional(","), ">"),

    // --- types -------------------------------------------------------------------------

    _type: ($) => choice($.named_type, $.function_type),

    // `Int`, `Opt<Int>`, `html::Doc`, `Self::Item`. Primitives are ordinary names resolved
    // against a prelude, so there is no separate rule for them.
    //
    // The qualifier is lowercase for a package and uppercase for an associated type's
    // projection — `html::Doc` against `Self::Item` — and identifier case tells them apart
    // with no lookahead, which is why one rule covers both.
    //
    // **The name may be lowercase**, which is the one place case is not decisive. The sized
    // integers are written `i8` and `u32`, and they are ordinary names rather than keywords —
    // `let u8 = 5;` binds a variable — so the only thing marking one as a type is standing in
    // type position. The compiler's own parser accepts either case here and leaves the
    // question to name resolution; matching that is what keeps a merely *unresolvable* type
    // from also being a parse error, which would cost the whole file its highlighting.
    named_type: ($) =>
      seq(
        // Repeated, because a package path can be more than one segment deep:
        // `io::Conn`, `super::text::Slug`. `self` and `super` need no rule of their own
        // — `identifier` already matches them, and what makes one a root is where it sits.
        repeat(seq(field("qualifier", $._path_segment), "::")),
        field("name", choice($.type_identifier, $.identifier)),
        optional(field("type_arguments", $.type_arguments)),
      ),

    function_type: ($) =>
      seq("fn", field("parameters", $.parameter_type_list), optional(seq("->", $._type))),

    parameter_type_list: ($) => seq("(", commaSep($._type), optional(","), ")"),

    // --- statements --------------------------------------------------------------------

    block: ($) => seq("{", repeat($._statement), optional(field("tail", $._expression)), "}"),

    _statement: ($) =>
      choice($.let_statement, $.assignment_statement, $.expression_statement),

    // `x = e;` and `p.f = e;`. The compiler decides this *after* parsing the left side, by a
    // checkpoint, and keeps `=` out of the operator table on purpose — an assignment is a
    // statement, so `a = b = c` and `f(x = 1)` do not parse. The target is a place there and an
    // ordinary expression here, because whether it is one is a question for the checker.
    assignment_statement: ($) =>
      seq(field("target", $._expression), "=", field("value", $._expression), ";"),

    let_statement: ($) =>
      seq(
        "let",
        // On the binding rather than on the type: what it describes is whether this *name* may
        // be made to mean something else later.
        optional("mut"),
        field("name", choice($.identifier, "_")),
        optional(seq(":", field("type", $._type))),
        "=",
        field("value", $._expression),
        ";",
      ),

    // A block-like expression may stand as a statement without a `;`, as in Rust.
    expression_statement: ($) =>
      choice(seq($._expression, ";"), prec(1, $._block_like_expression)),

    _block_like_expression: ($) =>
      choice(
        $.if_expression,
        $.match_expression,
        $.loop_expression,
        $.while_expression,
        $.for_expression,
        $.block,
      ),

    // --- expressions -------------------------------------------------------------------

    _expression: ($) =>
      choice(
        $.integer_literal,
        $.float_literal,
        $.string,
        $.boolean_literal,
        $.identifier,
        // A nullary constructor used as a value — `Nil`, `Point`, `Red`. Uppercase, because
        // identifier case is what tells a constructor from a variable.
        $.type_identifier,
        $.path_expression,
        $.parenthesized_expression,
        $.unary_expression,
        $.binary_expression,
        $.call_expression,
        $.field_expression,
        $.try_expression,
        $.struct_literal,
        $.lambda_expression,
        $.client_lambda_expression,
        $.element,
        $.if_expression,
        $.match_expression,
        $.loop_expression,
        $.for_expression,
        $.break_expression,
        $.continue_expression,
        $.return_expression,
        $.block,
      ),

    // `List::Cons`, `Array::new`, and `text::Found::One` — a package, then a type, then a
    // variant. The compiler puts no bound on the number of segments, so neither does this.
    path_expression: ($) =>
      seq(
        field("qualifier", $._path_segment),
        repeat1(seq("::", field("name", $._path_segment))),
      ),

    // `self` and `super` are keywords and are path segments all the same: they are *roots*,
    // and a root is the first thing a path can be. `io::println(..)` and
    // `super::text::slug(..)` are writable wherever a name is, so the `use` grammar and the
    // expression grammar are one grammar — a `use` abbreviates a path rather than enabling it.
    _path_segment: ($) => choice($.type_identifier, $.identifier),

    parenthesized_expression: ($) => seq("(", $._expression, ")"),

    unary_expression: ($) =>
      prec(PREC.unary, seq(field("operator", choice("-", "!")), field("operand", $._expression))),

    binary_expression: ($) => {
      const table = [
        [PREC.or, "||"],
        [PREC.and, "&&"],
        [PREC.bitor, "|"],
        [PREC.bitxor, "^"],
        [PREC.bitand, "&"],
        [PREC.equality, choice("==", "!=")],
        [PREC.comparison, choice("<", "<=", ">", ">=")],
        [PREC.shift, choice("<<", ">>")],
        [PREC.additive, choice("+", "-")],
        [PREC.multiplicative, choice("*", "/", "%")],
      ];
      return choice(
        ...table.map(([precedence, operator]) =>
          prec.left(
            precedence,
            seq(
              field("left", $._expression),
              field("operator", operator),
              field("right", $._expression),
            ),
          ),
        ),
      );
    },

    call_expression: ($) =>
      prec(PREC.postfix, seq(field("function", $._expression), field("arguments", $.argument_list))),

    argument_list: ($) => seq("(", commaSep($._expression), optional(","), ")"),

    field_expression: ($) =>
      prec(PREC.postfix, seq(field("value", $._expression), ".", field("field", $.identifier))),

    // `e?` — propagate a `Result`'s error to the caller. Desugars to a `match`, and names
    // `Result::Ok` and `Result::Err` by name, so the compiler holds no table of lang items.
    try_expression: ($) => prec(PREC.postfix, seq($._expression, "?")),

    // `Point { x: 1 }`, and `Conn<Active> { ..c }`.
    //
    // The type arguments are what a generic struct whose parameter appears in no field needs —
    // the typestate encoding — since neither a field value nor the expected type can say what
    // such a parameter is. They are also the only place in an expression where a `<` opens
    // something rather than comparing: `A < B > c` is a chain of comparisons and
    // `A < B > { .. }` is a literal, and the token after the `>` is the whole of the
    // difference. The compiler decides it with a lookahead scan; here the conflict declared
    // above lets lookahead reach the same answer.
    struct_literal: ($) =>
      seq(
        field("type", choice($.type_identifier, $.path_expression)),
        optional(field("type_arguments", $.type_arguments)),
        field("body", $.field_initializer_list),
      ),

    field_initializer_list: ($) =>
      seq(
        "{",
        commaSep(choice($.field_initializer, $.struct_base)),
        optional(","),
        optional(","),
        "}",
      ),

    field_initializer: ($) =>
      seq(field("name", $.identifier), ":", field("value", $._expression)),

    // `..base` — every field the literal does not write comes from there. Accepted anywhere in
    // the list, because a written field wins regardless: the base supplies only what is absent.
    struct_base: ($) => seq("..", field("value", $._expression)),

    // `client fn(e: InputEvent) { .. }` — not a closure. The compiler folds its body to directive
    // text rather than compiling it (`docs/design/09-live.md` §3).
    //
    // The marker is an **identifier**, not the string `"client"`, and that is the whole subtlety.
    // `client` is contextual — `core/net` binds a value called `client` — and a bare string makes
    // it a keyword everywhere an expression may start, which broke that file. Matching a name and
    // letting `fn` disambiguate accepts the slightly wider `anything fn(..) { .. }`, which is
    // exactly the trade `function_item` above already makes for a capitalised name: accept more
    // here, and leave the restriction where the message is.
    client_lambda_expression: ($) =>
      seq(
        field("marker", alias($.identifier, $.client)),
        "fn",
        field("parameters", $.parameter_list),
        optional(seq("->", field("return_type", $._type))),
        field("body", $.block),
      ),

    // `fn(x: Int) -> Int { x + 1 }`. Parameters are annotated, as in a declaration.
    lambda_expression: ($) =>
      seq(
        "fn",
        field("parameters", $.parameter_list),
        optional(seq("->", field("return_type", $._type))),
        field("body", $.block),
      ),

    if_expression: ($) =>
      seq(
        "if",
        field("condition", $._expression),
        field("consequence", $.block),
        optional(seq("else", field("alternative", choice($.block, $.if_expression)))),
      ),

    match_expression: ($) =>
      seq("match", field("value", $._expression), field("body", $.match_arm_list)),

    match_arm_list: ($) => seq("{", repeat($.match_arm), "}"),

    match_arm: ($) =>
      seq(field("pattern", $._pattern), "=>", field("value", $._expression), optional(",")),

    // `loop (i = 0, total = 0) { .. }` — the values that change between rounds are named,
    // because nothing else can change. The header *is* the block's parameter list.
    loop_expression: ($) =>
      seq("loop", optional(field("carried", $.loop_header)), field("body", $.block)),

    // `while cond { body }`. No header, unlike `loop`: what varies is whatever mutable local the
    // body assigns, and the compiler infers that set. `Unit`, so `loop` stays the form that
    // produces a value.
    while_expression: ($) =>
      seq("while", field("condition", $._expression), field("body", $.block)),

    // `for (total = 0) x in xs.iter() { .. }`, and `for x in xs.iter() { .. }`. The header is
    // the same one `loop` takes — the two forms are one idea, and a `for` carrying nothing is
    // the one written for what its body does.
    for_expression: ($) =>
      seq(
        "for",
        optional(field("carried", $.loop_header)),
        field("element", $.identifier),
        "in",
        field("iterator", $._expression),
        field("body", $.block),
      ),

    loop_header: ($) => seq("(", commaSep($.loop_binding), optional(","), ")"),

    loop_binding: ($) =>
      seq(
        field("name", $.identifier),
        optional(seq(":", field("type", $._type))),
        "=",
        field("value", $._expression),
      ),

    break_expression: ($) => prec.right(seq("break", optional($._expression))),

    continue_expression: ($) =>
      prec.right(
        seq("continue", optional(seq("(", commaSep($._expression), optional(","), ")"))),
      ),

    return_expression: ($) => prec.right(seq("return", optional($._expression))),

    // --- elements ----------------------------------------------------------------------

    // `</` and `/>` are single tokens rather than a `<` beside a `/`. Deciding whether a `<`
    // inside an element's content opens a nested one or closes this one otherwise needs two
    // tokens of lookahead, which an LR(1) parser does not have — the compiler peeks at
    // `nth(1)` for exactly this and can afford to.
    element: ($) =>
      choice(
        seq(
          field("open", $.element_open),
          optional(field("children", $.element_children)),
          field("close", $.element_close),
        ),
        $.element_self_closing,
      ),

    // A lowercase name is a tag the vocabulary declares; an uppercase one is a **component** — a
    // `view` called here, whose attributes are its parameters. Identifier case is semantic in this
    // language, and this is the second place it decides a meaning rather than a colour.
    _tag_name: ($) => choice($.identifier, $.type_identifier),

    element_open: ($) => seq("<", field("name", $._tag_name), repeat($.element_attribute), ">"),

    element_self_closing: ($) =>
      seq("<", field("name", $._tag_name), repeat($.element_attribute), "/>"),

    element_close: ($) => seq("</", field("name", $._tag_name), ">"),

    // `class="card"`, `class={expr}`, or a bare `disabled`.
    //
    // **A bare attribute means `={true}`** — HTML's own boolean shorthand, and the one place a
    // name on its own has something to mean. This rule used to require the value and carried a
    // comment saying a bare name could not mean anything; `<input type="text" name="n" required/>`
    // is in the examples, so it did.
    element_attribute: ($) =>
      seq(
        field("name", $.attribute_name),
        optional(seq("=", field("value", choice($.string, $.element_value)))),
      ),

    element_value: ($) => seq("{", $._expression, "}"),

    element_children: ($) => repeat1(choice($.element_text, $.element_interpolation, $.element)),

    element_interpolation: ($) => seq("{", $._expression, "}"),

    // --- patterns ----------------------------------------------------------------------

    _pattern: ($) =>
      choice(
        $.wildcard_pattern,
        $.binding_pattern,
        $.literal_pattern,
        $.path_pattern,
        $.tuple_struct_pattern,
      ),

    wildcard_pattern: (_) => "_",

    binding_pattern: ($) => $.identifier,

    // A float pattern is rejected by the compiler — deciding exhaustiveness over doubles
    // means deciding equality on them, and `NaN` makes that a question with no good answer —
    // but it is accepted here on purpose. This grammar exists to highlight code, and a file
    // should not stop being highlightable because one line of it will not compile.
    literal_pattern: ($) => choice($.integer_literal, $.float_literal, $.boolean_literal),

    // `Nothing`, `Colour::Blue`, `text::Found::One`. A lowercase first segment is a package
    // here rather than a new binding, which is why this arm is tried before `binding_pattern`.
    path_pattern: ($) =>
      choice(
        $.type_identifier,
        seq($._path_segment, repeat1(seq("::", $._path_segment))),
      ),

    // A constructor's fields may only be names — a nested pattern is rejected by the
    // compiler rather than compiled, because code generation extracts fields with no test of
    // its own. It is a grammar the parser accepts and the checker refuses.
    tuple_struct_pattern: ($) =>
      seq(field("type", $.path_pattern), "(", commaSep($._pattern), optional(","), ")"),

    // --- tokens ------------------------------------------------------------------------

    // Lowercase or underscore: a value name.
    identifier: (_) => /[a-z_][A-Za-z0-9_]*/,

    // Uppercase: a type or constructor name. The case distinction is semantic in Gloss, not
    // a convention, which is why there is no lowercase `int` keyword to collide with it.
    type_identifier: (_) => /[A-Z][A-Za-z0-9_]*/,

    // Every radix, with `_` as a separator anywhere.
    integer_literal: (_) =>
      token(
        choice(
          /0[xX][0-9a-fA-F_]+/,
          /0[bB][01_]+/,
          /0[oO][0-7_]+/,
          /[0-9][0-9_]*/,
        ),
      ),

    // A `.` followed by a digit is a fraction; a bare `.` is field access, so `1.max(2)`
    // stays two tokens and a method call.
    float_literal: (_) =>
      token(
        choice(
          /[0-9][0-9_]*\.[0-9][0-9_]*([eE][+-]?[0-9_]+)?/,
          /[0-9][0-9_]*[eE][+-]?[0-9_]+/,
        ),
      ),

    boolean_literal: (_) => choice("true", "false"),

    // A deliberately small escape set. A language that accepts `\u{...}` has to decide what
    // it means for every target, and there is no reason to decide that yet.
    //
    // **A `{` opens a hole**, so it is excluded from the content and a literal brace is `\{`. The
    // compiler accepts that escape in every string rather than only in one with holes, because the
    // same text has to mean the same thing either way — and a string with no hole is still just
    // this rule with no `string_interpolation` in it. A `}` is ordinary content: only `{` opens.
    string: ($) =>
      seq(
        '"',
        repeat(choice($.escape_sequence, $.string_interpolation, /[^"{\\\n]+/)),
        '"',
      ),

    // `{n}`, holding an ordinary expression — the compiler parses one with the ordinary expression
    // parser, so there is nothing narrower to say here either.
    string_interpolation: ($) => seq("{", $._expression, "}"),

    escape_sequence: (_) => token.immediate(/\\[nrt0\\"{}]/),
  },
});

// **A trailing comma is allowed everywhere the compiler allows one**, which is everywhere: its
// list loops consume a comma and then test for the closing delimiter, so `(a, b,)` parses. Five
// rules here forbade it — a parameter type list, a struct literal's fields, a `loop` header, a
// `continue`'s arguments and a tuple-struct pattern — and `script/check-against-compiler` found the
// lot through *one* file in the standard library that the formatter had wrapped. A corpus written to
// suit the grammar would never have covered it.
function commaSep(rule) {
  return optional(commaSep1(rule));
}

function commaSep1(rule) {
  return sep1(rule, ",");
}

function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}
