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
  // `|>` binds loosest of all: `a + b |> f` pipes the sum.
  pipe: 0,
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
  // Postfix `.field` and `(args)` bind tighter than any operator.
  postfix: 12,
};

module.exports = grammar({
  name: "gloss",

  extras: ($) => [/\s/, $.comment],

  // `_soft_end` is the one piece of the newline rule the automaton cannot see: a statement ends
  // at a line break when the next line opens with `<`, `(` or `-`, which would otherwise read
  // as a comparison, a call or a subtraction continuing it. The scanner produces it only there.
  // `_sql_keyword` is the `sql` that opens a query literal, scanned externally so it can look
  // past itself for the `(` or `{` that makes it one; see `scan_sql_keyword` in the scanner.
  externals: ($) => [$.element_text, $._soft_end, $._sql_keyword],

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
    // A statement ends with its line, so an expression before a `}` is either the last
    // statement or the block's value. Both readings are kept and dynamic precedence picks the
    // value, which is what the compiler does by reading the newline.
    [$.block, $.expression_statement],
    // `(x)` is a parenthesized value until a `=>` says it was an arrow's parameter list. The
    // compiler scans ahead for the arrow; here both readings run until the token after `)`.
    [$.parameter, $._expression],
    // `x if x > y => y`: the `=>` ends the guard, so `y` is an operand, but `y =>` is also how
    // an arrow closure begins. Both run; the closure's reading leaves the arm with no arrow
    // and dies there.
    [$.lambda_expression, $._expression],
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
    package_declaration: ($) => seq("package", field("name", $.identifier), optional(";")),

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
    // `import` is the spelling the rebalance settled on; `use` stays accepted by the compiler
    // until every file has moved, and in a block it is the continuation statement below.
    use_declaration: ($) =>
      seq(choice("use", "import"), field("tree", $.use_tree), optional(";")),

    // `a::b`, `a::{b, c::{D, E}}`, `a::*`, or `a::b as c` — Rust's grouping, so a group's member
    // is a tree of its own and may carry its own `as`.
    use_tree: ($) =>
      seq(
        field("path", $.use_path),
        optional(choice($.use_glob, field("group", $.use_group))),
        optional(seq("as", field("alias", choice($.identifier, $.type_identifier)))),
      ),

    use_path: ($) =>
      seq(
        choice($.identifier, $.type_identifier, "self", "super"),
        repeat(seq("::", choice($.identifier, $.type_identifier, "self", "super"))),
      ),

    use_glob: (_) => seq("::", "*"),

    use_group: ($) => seq("::", "{", commaSep($.use_tree), optional(","), "}"),

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
        $.test_item,
        $.const_item,
        $.type_alias_item,
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
        // A literal initializer says its own type; anything else is annotated.
        optional(seq(":", field("type", $._type))),
        "=",
        field("value", $._expression),
        optional(";"),
      ),

    // `type Slug = Str;`, `type Rows<T> = Array<T>;`
    //
    // The same keyword as an associated type and a different item, told apart by where it is
    // written: an associated one appears only inside a `trait` or an `impl` body. Unlike `const`
    // this needed no contextual trick — `type` was already a keyword, spent on the associated
    // form, so a top-level alias takes no identifier out of circulation that was not gone.
    //
    // An alias is **transparent**: it stands for what follows the `=` and never becomes a type of
    // its own, which is why it needs no shape here beyond a name and a type.
    type_alias_item: ($) =>
      seq(
        optional($._modifiers),
        "type",
        field("name", $.type_identifier),
        optional(field("type_parameters", $.type_parameters)),
        "=",
        field("value", $._type),
        optional(";"),
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
    _modifier: (_) => choice("pub", "view", "linear", "extern", "opaque"),

    _modifiers: ($) => repeat1($._modifier),

    // `view` marks a function as returning `Html`. The compiler scans the run of modifiers and
    // dispatches on what it ends at, so any order of any subset parses and a repeat is a
    // *diagnostic* rather than a parse error — this mirrors that, rather than enumerating the
    // orders.
    // A statement ends with its line, so a body-less declaration needs no `;` — and a `view`
    // may drop the `fn`: `view Card(title: Str) { .. }`. The keyword is optional after *any*
    // run of modifiers rather than only after `view`, because a run is one rule here; which
    // modifiers permit the omission is the compiler's business, and every item but a function
    // begins with its own keyword, so nothing else can follow a modifier and a name.
    function_item: ($) =>
      seq(
        optional($._modifiers),
        optional("fn"),
        // Either case. Identifier case is semantic here, so a name is ordinarily lowercase —
        // but a `view` may be capitalised, because a component is a thing rather than an action
        // and because `<Card/>` will need the capital to tell a component from a tag. The
        // compiler allows it only after `view`; accepting it here for any `fn` keeps this LR(1)
        // and leaves the restriction where the message is.
        field("name", choice($.identifier, $.type_identifier)),
        // Declared in angles only: a function names its variables by using them, and a paren
        // list after its name is its parameters.
        optional(field("type_parameters", alias($._angle_type_parameters, $.type_parameters))),
        field("parameters", $.parameter_list),
        optional(seq("->", field("return_type", $._type))),
        optional(field("where", $.where_clause)),
        // A body, or none. The second is what an `@intrinsic` declaration is: the runtime
        // supplies the body and the declaration supplies only the type.
        //
        // Accepted for *any* function, exactly as the compiler's parser accepts it, and for the
        // same reason — which declarations may go without a body is a question about the
        // attribute, and an attribute is the item's *sibling* rather than part of it. So neither
        // parser can tell from here, and the rule is stated where the answer is known.
        optional(field("body", choice($.block, ";"))),
      ),

    parameter_list: ($) =>
      seq("(", commaSep(choice($.self_parameter, $.parameter)), optional(","), ")"),

    // A bare `self`, which needs no annotation because the impl block says what it is.
    self_parameter: (_) => "self",

    // The annotation is *semantically* mandatory — no cross-module inference is what lets
    // modules check in parallel and in any order — but it is optional in the grammar, exactly
    // as it is in the compiler's. Rejecting it here would replace the checker's explanation of
    // why it is required with a parse error that says nothing.
    // `status: Int = 200` — a parameter a call may leave out.
    parameter: ($) =>
      seq(
        field("name", choice($.identifier, "_")),
        optional(seq(":", field("type", $._type))),
        optional(seq("=", field("default", $._expression))),
      ),

    struct_item: ($) =>
      seq(
        optional($._modifiers),
        "struct",
        field("name", $.type_identifier),
        optional(field("type_parameters", $.type_parameters)),
        // `struct Idle;` — a marker, carrying nothing. The braced form asserts there is
        // nothing between the braces; the terminator says the same in one character. Nothing
        // downstream tells them apart: a struct is a one-constructor algebraic type either
        // way, and the bare literal `Idle` is that constructor applied to no fields.
        optional(choice(field("body", $.field_list), ";")),
      ),

    // The fields, and then the type's own methods: `struct Accounts { users: Store, fn get(id:
    // Int) -> Option(User) { users.get(id) } }`. A method ends itself, so no comma follows one.
    field_list: ($) =>
      seq(
        "{",
        repeat(choice(seq($.field_declaration, optional(",")), $.function_item)),
        "}",
      ),

    field_declaration: ($) => seq(field("name", $.identifier), ":", field("type", $._type)),

    enum_item: ($) =>
      seq(
        optional($._modifiers),
        "enum",
        field("name", $.type_identifier),
        optional(field("type_parameters", $.type_parameters)),
        field("body", $.variant_list),
      ),

    variant_list: ($) => seq("{", commaSep($.variant), optional(","), "}"),

    variant: ($) =>
      seq(field("name", $.type_identifier), optional(field("payload", $.variant_payload))),

    // `(Int, List)`, or `(user: NewUser, reply: Reply(Int))` — a variant's fields are all
    // positional or all labelled, and the compiler says which.
    variant_payload: ($) =>
      seq("(", commaSep1(choice($.variant_field, $._type)), optional(","), ")"),

    variant_field: ($) => seq(field("name", $.identifier), ":", field("type", $._type)),

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
        optional(";"),
      ),

    // `fn show(self) -> Str;` — no body. With one it is a *default*, and parses as an
    // ordinary `function_item`, because that is what it compiles to: a function generic over
    // `Self`, bounded by this trait.
    //
    // The precedence is what tells the two apart inside a trait body, and it is needed because a
    // top-level `fn` may *also* end in a `;` now — that is an `@intrinsic` declaration, whose
    // body the runtime supplies. The two forms are identical to look at, so the tie is broken by
    // where they are: inside a trait, a body-less `fn` is a method signature and nothing else,
    // because an intrinsic is a top-level declaration and a trait's members are not items.
    method_signature: ($) =>
      prec(1, seq(
        optional($._modifiers),
        "fn",
        field("name", $.identifier),
        field("parameters", $.parameter_list),
        optional(seq("->", field("return_type", $._type))),
        optional(";"),
      )),

    // `impl Show for Int`, or `impl<T> Array<T>` for an inherent block. Both start with a
    // type and the `for` decides which was which — the compiler parses one and looks, rather
    // than guessing, which is what lets a trait be package-qualified and a self type generic.
    //
    // `extend Tracer { .. }` adds methods to a type declared elsewhere, and is the inherent
    // block under another name. The bounds on an impl's variables go in a `where` clause after
    // the head.
    impl_item: ($) =>
      seq(
        optional($._modifiers),
        choice("impl", "extend"),
        optional(field("type_parameters", alias($._angle_type_parameters, $.type_parameters))),
        field("trait", $._type),
        optional(seq("for", field("type", $._type))),
        optional(field("where", $.where_clause)),
        field("body", $.impl_body),
      ),

    // An **associated constant** — `impl Int { const MAX: Int = ..; }` — is an ordinary
    // `const_item` written inside the block, which is what the compiler's parser does with it:
    // one `const_item` rule, reached from the item loop and from an impl's member loop.
    impl_body: ($) =>
      seq(
        "{",
        repeat(choice($.associated_type, $.const_item, $.function_item)),
        "}",
      ),

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
    // `aria-label`, and `x-on:click` — a `:` followed by a letter continues the name, as HTML's
    // namespaced and directive attributes need.
    attribute_name: (_) => token(/[A-Za-z_][A-Za-z0-9_]*([-:][A-Za-z_][A-Za-z0-9_]*)*/),

    // --- generics ----------------------------------------------------------------------

    // `(a, b)` is the spelling; `<T, U>` stays accepted until every file has moved. A variable
    // is a lowercase name, and need not be declared at all — a function names its own by
    // using them — which is what the `where` clause below bounds.
    type_parameters: ($) =>
      choice(
        $._angle_type_parameters,
        seq("(", commaSep1($.type_parameter), optional(","), ")"),
      ),

    // The declared form alone, for an `impl` head: `impl(t) ..` would read as a function type
    // standing for the trait, and an impl declares nothing in the new spelling — it names its
    // variables in the type and bounds them in `where`.
    _angle_type_parameters: ($) => seq("<", commaSep1($.type_parameter), optional(","), ">"),

    type_parameter: ($) =>
      seq(
        field("name", choice($.identifier, $.type_identifier)),
        optional(seq(":", field("bounds", $.bound_list))),
      ),

    // `where t: Ord, k: Hash + Eq` — after a signature or an impl head. A predicate is the
    // same node a declared parameter is, which is how the compiler merges the two by name.
    //
    // Right-associative so the list runs as far as the commas do: inside an `elements` block a
    // member may be followed by a comma of its own, and that one belongs to the block.
    where_clause: ($) => prec.right(seq("where", commaSep1($.type_parameter))),

    bound_list: ($) => sep1($.bound, "+"),


    // `Iterator`, `html::Doc`, or `Iterator<Item = Int>` — a bound that also fixes one of the
    // trait's associated types. The angle brackets are free here because the language has no
    // generic traits, so an equation is the only thing that can stand in them.
    bound: ($) =>
      seq(
        optional(seq(field("package", $.identifier), "::")),
        field("name", $.type_identifier),
        optional(field("assoc", $.assoc_bindings)),
      ),

    assoc_bindings: ($) =>
      choice(
        seq("<", commaSep1($.assoc_binding), optional(","), ">"),
        seq("(", commaSep1($.assoc_binding), optional(","), ")"),
      ),

    assoc_binding: ($) =>
      seq(field("name", $.type_identifier), "=", field("value", $._type)),

    // `Option(Int)` — a type applied to arguments is written like a value built from them.
    type_arguments: ($) =>
      choice(
        seq("<", commaSep1($._type), optional(","), ">"),
        seq("(", commaSep1($._type), optional(","), ")"),
      ),

    // --- types -------------------------------------------------------------------------

    _type: ($) => choice($.union_type, $._type_term),

    // `"get" | "post"`, `1 | 2 | 3` — a union of literal types.
    //
    // Members are literals of one base type, and that is a *checking* rule rather than a grammar
    // one: `Int | Str` parses here and is refused with a message pointing at `enum`, because
    // whether a member is a literal is a question about what a name resolved to.
    //
    // A `function_type`'s return is a `_type_term`, so `fn() -> A | B` reads as two members of one
    // union rather than as a function returning a union. Neither is more useful than the other — a
    // union member has to be a literal, so a function type can never be one.
    union_type: ($) => prec.left(seq($._type_term, repeat1(seq("|", $._type_term)))),

    _type_term: ($) => choice($.named_type, $.function_type, $.tuple_type, $.literal_type),

    // `(Int, Str)` — the prelude's `Pair`, nested to the right. The same parenthesised list a
    // bare function type opens with; the arrow after it is what tells them apart.
    tuple_type: ($) => $.parameter_type_list,

    // `"get"`, `3`, `-1`, `true` in type position — a type inhabited by exactly one value.
    //
    // A decimal number is refused for the reason it is refused as a *pattern*: deciding whether
    // one member covers another needs equality on doubles, and `NaN` makes that a question with
    // no good answer.
    literal_type: ($) =>
      choice(
        $.string,
        $.char_literal,
        $.integer_literal,
        $.boolean_literal,
        seq("-", $.integer_literal),
      ),

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

    // `(Request) -> Response` — bare; the `fn` spelling stays accepted until every file has moved.
    function_type: ($) =>
      choice(
        seq(
          "fn",
          field("parameters", $.parameter_type_list),
          optional(seq("->", $._type_term)),
        ),
        seq(field("parameters", $.parameter_type_list), "->", $._type_term),
      ),

    parameter_type_list: ($) => seq("(", commaSep($._type), optional(","), ")"),

    // --- statements --------------------------------------------------------------------

    block: ($) => seq("{", repeat($._statement), optional(field("tail", $._expression)), "}"),

    // A statement ends with its line, and a `;` is written only between two on one line. The
    // compiler reads the newline; this grammar makes the `;` optional and lets the automaton
    // settle where one statement ends — which differs from the compiler in exactly the cases
    // the reference calls out, a `(` or a `-` opening the next line, and in those it still
    // produces a tree rather than an error.
    _statement: ($) =>
      choice($.let_statement, $.use_statement, $.assert_statement, $.expression_statement),

    // `assert reply.status == 303` — a panic, naming the condition, when it is false. The word
    // is contextual in the compiler; here it is only this token where a statement may start.
    assert_statement: ($) =>
      seq("assert", field("condition", $._expression), optional($._terminator)),

    let_statement: ($) =>
      choice(
        seq(
          "let",
          field("name", choice($.identifier, "_")),
          optional(seq(":", field("type", $._type))),
          "=",
          field("value", $._expression),
          optional($._terminator),
        ),
        // `let Some(x) = e else { .. }` — a pattern, and the block that runs when it does not
        // match. `let (a, b) = pair` never fails and writes no `else`; which patterns may go
        // without one is the checker's question, so the grammar takes either.
        seq(
          "let",
          field(
            "pattern",
            choice(
              $.tuple_struct_pattern,
              $.tuple_pattern,
              $.list_pattern,
              $.path_pattern,
              $.literal_pattern,
            ),
          ),
          "=",
          field("value", $._expression),
          optional(seq("else", field("else", $.block))),
          optional($._terminator),
        ),
        // `let assert Some(x) = e` — the same pattern, and a panic where the `else` would be.
        seq(
          "let",
          "assert",
          field("pattern", $._pattern),
          "=",
          field("value", $._expression),
          optional($._terminator),
        ),
      ),

    // `use x <- f(a)` — the rest of the block becomes a closure, and the call takes it as its
    // last argument. Gleam's continuation, spelled with Gleam's arrow. `use <- f(a)` binds
    // nothing, for a callee whose closure takes nothing.
    use_statement: ($) =>
      seq(
        "use",
        optional(field("pattern", $._pattern)),
        "<-",
        field("value", $._expression),
        optional($._terminator),
      ),

    // An expression standing as a statement. Without a `;` it is also what a block's tail is,
    // and the two readings are told apart by dynamic precedence: the last expression of a block
    // is its value.
    expression_statement: ($) =>
      choice(seq($._expression, $._terminator), prec.dynamic(-1, $._expression)),

    // `;` between two statements on one line, or the line break the scanner reports — see
    // `externals`. Every other line break ends a statement by the automaton running out of
    // ways to continue it.
    _terminator: ($) => choice(";", $._soft_end),

    _block_like_expression: ($) =>
      choice(
        $.if_expression,
        $.match_expression,
        $.loop_expression,
        $.for_expression,
        $.block,
      ),

    // --- expressions -------------------------------------------------------------------

    _expression: ($) =>
      choice(
        $.integer_literal,
        $.float_literal,
        $.string,
        $.sql_literal,
        $.char_literal,
        $.boolean_literal,
        $.identifier,
        // A nullary constructor used as a value — `Nil`, `Point`, `Red`. Uppercase, because
        // identifier case is what tells a constructor from a variable.
        $.type_identifier,
        $.path_expression,
        $.parenthesized_expression,
        $.tuple_expression,
        $.list_expression,
        $.unary_expression,
        $.binary_expression,
        $.call_expression,
        $.field_expression,
        $.try_expression,
        $.struct_literal,
        $.lambda_expression,
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

    // `(a, b)` — the prelude's `Pair`, nested to the right for more.
    tuple_expression: ($) =>
      seq("(", $._expression, repeat1(seq(",", $._expression)), optional(","), ")"),

    // `[a, b, ..rest]` — the prelude's `List`, as `Cons` and `Nil`.
    list_expression: ($) =>
      seq("[", commaSep(choice($._expression, $.rest_expression)), optional(","), "]"),

    rest_expression: ($) => seq("..", field("value", $._expression)),

    unary_expression: ($) =>
      prec(PREC.unary, seq(field("operator", choice("-", "!")), field("operand", $._expression))),

    binary_expression: ($) => {
      const table = [
        [PREC.pipe, "|>"],
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

    // `(a, name: b, other:, ..base)` — positional, then by name, then a constructor's base.
    // The order is the compiler's rule; here any mix parses, and that is a diagnostic there.
    argument_list: ($) =>
      seq(
        "(",
        commaSep(choice($._expression, $.labelled_argument, $.struct_base)),
        optional(","),
        ")",
      ),

    // `name: value`, or `name:` for the local of that name.
    labelled_argument: ($) =>
      seq(field("name", $.identifier), ":", optional(field("value", $._expression))),

    field_expression: ($) =>
      prec(PREC.postfix, seq(field("value", $._expression), ".", field("field", $.identifier))),

    // `e?` — propagate a `Result`'s error to the caller. Desugars to a `match`, and names
    // `Result::Ok` and `Result::Err` by name, so the compiler holds no table of lang items.
    // `try e` — prefix, binding like `-` and `!`, so it covers the postfix chain to its right.
    // Which calls inside the operand unwrap is decided by their types, in the checker.
    try_expression: ($) => prec(PREC.unary, seq("try", field("operand", $._expression))),

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


    // `fn(x: Int) -> Int { x + 1 }`. Parameters may be annotated, as in a declaration, or left
    // for the type expected of the closure to supply. The body is a block and only a block; the
    // keyword is what keeps a closure and a `match` arm's `=>` apart without lookahead.
    // Or `(x: Int) -> Int => x + 1`, `n => n * 2`, `(a, b) => { .. }` — the arrow, which is the
    // spelling; `fn` stays accepted until every file has moved. The body runs as far right as
    // an expression can.
    lambda_expression: ($) =>
      choice(
        seq(
          "fn",
          field("parameters", $.parameter_list),
          optional(seq("->", field("return_type", $._type))),
          field("body", $.block),
        ),
        prec.right(
          seq(
            field("parameters", choice($.identifier, "_", alias($._arrow_parameters, $.parameter_list))),
            optional(seq("->", field("return_type", $._type))),
            "=>",
            field("body", $._expression),
          ),
        ),
      ),

    // An arrow's parameters, which never include `self`: with it in the list, `(self + 1)` would
    // lex `self` as the keyword the moment a parameter list was possible and lose the value.
    _arrow_parameters: ($) => seq("(", commaSep($.parameter), optional(","), ")"),

    // Right-associative, so an `else` binds to the nearest `if` — which is what settles
    // `let P = if c { a } else { b } else { .. }` the way the compiler's greedy `if` does.
    if_expression: ($) =>
      prec.right(
        seq(
          "if",
          field("condition", $._expression),
          field("consequence", $.block),
          optional(seq("else", field("alternative", choice($.block, $.if_expression)))),
        ),
      ),

    // `match a, b { p, q => .. }` — several subjects without a tuple, one pattern each.
    match_expression: ($) =>
      seq("match", commaSep1(field("value", $._expression)), field("body", $.match_arm_list)),

    match_arm_list: ($) => seq("{", repeat($.match_arm), "}"),

    match_arm: ($) =>
      seq(
        commaSep1(field("pattern", $._pattern)),
        optional(field("guard", $.match_guard)),
        "=>",
        field("value", $._expression),
        // An arm ends with its line as a statement does, and the same line break the scanner
        // reports ends it where the next arm opens with `(` or `[`.
        optional(choice(",", $._soft_end)),
      ),

    // `pat if cond =>`. The condition runs to the `=>`, which the compiler keeps from being
    // read as an arrow closure's; here the two readings run side by side and only the one
    // that reaches the arm's arrow survives.
    match_guard: ($) => seq("if", field("condition", $._expression)),

    // `loop (i = 0, total = 0) { .. }` — the values that change between rounds are named,
    // because nothing else can change. The header *is* the block's parameter list.
    loop_expression: ($) =>
      seq("loop", optional(field("carried", $.loop_header)), field("body", $.block)),


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
    //
    // A lowercase tag may hold hyphens — `<sl-button>`, `<mj-section>` — which is what a web
    // component is called, and what MJML's elements are called. Written as a *sequence* rather
    // than as a token regex the way `attribute_name` is, because a token here would collide with
    // `identifier` and with `type_identifier` in the lexer — and, more to the point, because it is
    // what the compiler's parser does: the run is left flat rather than wrapped in a node of its
    // own, since nothing in tag position is an expression and the enclosing node is therefore
    // already enough to say a `-` here can only be continuing a name.
    _tag_name: ($) => choice($._hyphenated_name, $.type_identifier),

    _hyphenated_name: ($) => seq($.identifier, repeat(seq("-", $.identifier))),

    // `<div class="a">`, or `<>` — a fragment, with no name and no attributes.
    element_open: ($) =>
      seq("<", optional(seq(field("name", $._tag_name), repeat($.element_attribute))), ">"),

    element_self_closing: ($) =>
      seq("<", field("name", $._tag_name), repeat($.element_attribute), "/>"),

    element_close: ($) => seq("</", optional(field("name", $._tag_name)), ">"),

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
        $.tuple_pattern,
        $.list_pattern,
      ),

    // `(p, q)` — a `Pair` taken apart.
    tuple_pattern: ($) =>
      seq("(", $._pattern, repeat1(seq(",", $._pattern)), optional(","), ")"),

    // `[p, q]`, `[first, ..]`, `[head, ..tail]` — `Cons` and `Nil` taken apart.
    list_pattern: ($) =>
      seq("[", commaSep(choice($._pattern, $.rest_pattern)), optional(","), "]"),

    wildcard_pattern: (_) => "_",

    binding_pattern: ($) => $.identifier,

    // A float pattern is rejected by the compiler — deciding exhaustiveness over doubles
    // means deciding equality on them, and `NaN` makes that a question with no good answer —
    // but it is accepted here on purpose. This grammar exists to highlight code, and a file
    // should not stop being highlightable because one line of it will not compile.
    // A string is one now, and only where the scrutinee is a *union*: `Str` has more values than
    // anyone will write down, so a set of string arms over one can never be complete. Which it is
    // is a question about types, so the grammar accepts both and the compiler decides. A float is
    // still accepted here and still refused there, for the `NaN` reason.
    literal_pattern: ($) =>
      choice($.integer_literal, $.float_literal, $.boolean_literal, $.string, $.char_literal),

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
    //
    // `Insert(user:, reply: r)` names fields; `Thread(id:, ..)` leaves the rest unwritten.
    tuple_struct_pattern: ($) =>
      seq(
        field("type", $.path_pattern),
        "(",
        commaSep(choice($._pattern, $.field_pattern, $.rest_pattern)),
        optional(","),
        ")",
      ),

    // `name: pat`, or `name:` binding the field to a local of that name.
    field_pattern: ($) => seq(field("name", $.identifier), ":", optional(field("pattern", $._pattern))),

    // `..` for the fields a constructor pattern leaves unwritten, or `..tail` binding the
    // rest of a list.
    rest_pattern: ($) => seq("..", optional(field("binding", $.identifier))),

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
        // A string may span lines; the newlines are part of it.
        repeat(choice($.escape_sequence, $.string_interpolation, /[^"{\\]+/)),
        '"',
      ),

    // `{n}`, holding an ordinary expression — the compiler parses one with the ordinary expression
    // parser, so there is nothing narrower to say here either.
    string_interpolation: ($) => seq("{", $._expression, "}"),

    // `sql(User) { SELECT * FROM users WHERE id = {id} }` — a query literal: the word, the row
    // type if written, and the author's SQL as runs of text with holes between them. What the
    // text means is the compiler's business; the grammar takes everything that is not a brace.
    sql_literal: ($) =>
      seq(
        alias($._sql_keyword, "sql"),
        optional(seq("(", field("row", $._type), ")")),
        "{",
        repeat(choice($.sql_hole, $.sql_text)),
        "}",
      ),

    sql_text: (_) => /[^{}]+/,

    sql_hole: ($) => seq("{", $._expression, "}"),

    // `'a'`, `'\n'`, `'\u{1F600}'` — one character. The compiler counts; the grammar takes what
    // is between the quotes, as it does for a string, so `'ab'` parses here and errors there.
    char_literal: ($) => seq("'", choice($.escape_sequence, /[^'\\\n]/), "'"),

    // `\u{..}` names a scalar value in one to six hex digits; the rest are the single-character
    // escapes. `'` and `"` are both accepted in both literal kinds, so there is one escape set.
    escape_sequence: (_) => token.immediate(/\\([nrt0\\"'{}]|u\{[0-9a-fA-F]{1,6}\})/),
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
