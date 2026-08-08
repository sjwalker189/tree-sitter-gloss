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
  ],

  rules: {
    source_file: ($) =>
      seq(optional($.package_declaration), repeat($.import_declaration), repeat($._item)),

    comment: (_) => token(seq("//", /.*/)),

    // --- items -------------------------------------------------------------------------

    // `package html;` — checked against the directory the file sits in, so a file moved into
    // the wrong place is an error rather than a silent change of meaning.
    package_declaration: ($) => seq("package", field("name", $.identifier), ";"),

    // `import "../html";` or `import s "core/strings";` — a relative path to a directory,
    // because a package *is* a directory.
    import_declaration: ($) =>
      seq("import", optional(field("alias", $.identifier)), field("path", $.string), ";"),

    _item: ($) =>
      choice(
        $.function_item,
        $.struct_item,
        $.enum_item,
        $.trait_item,
        $.impl_item,
        $.elements_item,
      ),

    // `view` marks a function as capability-free apart from its medium.
    function_item: ($) =>
      seq(
        optional("pub"),
        optional("view"),
        "fn",
        field("name", $.identifier),
        optional(field("type_parameters", $.type_parameters)),
        field("parameters", $.parameter_list),
        optional(seq("->", field("return_type", $._type))),
        field("body", $.block),
      ),

    parameter_list: ($) => seq("(", commaSep(choice($.self_parameter, $.parameter)), ")"),

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
        optional("pub"),
        optional("linear"),
        "struct",
        field("name", $.type_identifier),
        optional(field("type_parameters", $.type_parameters)),
        field("body", $.field_list),
      ),

    field_list: ($) => seq("{", commaSep($.field_declaration), optional(","), "}"),

    field_declaration: ($) => seq(field("name", $.identifier), ":", field("type", $._type)),

    enum_item: ($) =>
      seq(
        optional("pub"),
        optional("linear"),
        "enum",
        field("name", $.type_identifier),
        optional(field("type_parameters", $.type_parameters)),
        field("body", $.variant_list),
      ),

    variant_list: ($) => seq("{", commaSep($.variant), optional(","), "}"),

    variant: ($) =>
      seq(field("name", $.type_identifier), optional(field("payload", $.variant_payload))),

    variant_payload: ($) => seq("(", commaSep1($._type), ")"),

    trait_item: ($) =>
      seq(
        optional("pub"),
        "trait",
        field("name", $.type_identifier),
        optional(seq(":", field("supertraits", $.bound_list))),
        field("body", $.trait_body),
      ),

    trait_body: ($) => seq("{", repeat(choice($.method_signature, $.function_item)), "}"),

    // `fn show(self) -> Str;` — no body. With one it is a *default*, and parses as an
    // ordinary `function_item`, because that is what it compiles to: a function generic over
    // `Self`, bounded by this trait.
    method_signature: ($) =>
      seq(
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
        optional("pub"),
        "impl",
        optional(field("type_parameters", $.type_parameters)),
        field("trait", $._type),
        optional(seq("for", field("type", $._type))),
        field("body", $.impl_body),
      ),

    impl_body: ($) => seq("{", repeat($.function_item), "}"),

    // `elements Html { element div: Children & { class: Str } }` — a vocabulary. It becomes a
    // trait and a struct per element; nothing downstream knows it was written this way.
    elements_item: ($) =>
      seq(
        optional("pub"),
        "elements",
        field("name", $.type_identifier),
        optional(seq(":", field("supertraits", $.bound_list))),
        "{",
        commaSep(choice($.text_declaration, $.element_declaration)),
        optional(","),
        "}",
      ),

    // The marker saying this vocabulary admits character data. `text` and `element` are
    // contextual: the compiler matches them by spelling here and lexes them as ordinary
    // identifiers everywhere else, so neither is reserved.
    text_declaration: (_) => "text",

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
      seq(field("name", $.identifier), optional("?"), ":", field("type", $._type)),

    // --- generics ----------------------------------------------------------------------

    type_parameters: ($) => seq("<", commaSep1($.type_parameter), ">"),

    type_parameter: ($) =>
      seq(field("name", $.type_identifier), optional(seq(":", field("bounds", $.bound_list)))),

    bound_list: ($) => sep1($.named_type, "+"),

    type_arguments: ($) => seq("<", commaSep1($._type), ">"),

    // --- types -------------------------------------------------------------------------

    _type: ($) => choice($.named_type, $.function_type),

    // `Int`, `Opt<Int>`, `html::Doc`. Primitives are ordinary names, resolved against a
    // prelude, so there is no separate rule for them.
    named_type: ($) =>
      seq(
        optional(seq(field("package", $.identifier), "::")),
        field("name", $.type_identifier),
        optional(field("type_arguments", $.type_arguments)),
      ),

    function_type: ($) =>
      seq("fn", field("parameters", $.parameter_type_list), optional(seq("->", $._type))),

    parameter_type_list: ($) => seq("(", commaSep($._type), ")"),

    // --- statements --------------------------------------------------------------------

    block: ($) => seq("{", repeat($._statement), optional(field("tail", $._expression)), "}"),

    _statement: ($) => choice($.let_statement, $.expression_statement),

    let_statement: ($) =>
      seq(
        "let",
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
      choice($.if_expression, $.match_expression, $.loop_expression, $.block),

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
        $.element,
        $.if_expression,
        $.match_expression,
        $.loop_expression,
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

    argument_list: ($) => seq("(", commaSep($._expression), ")"),

    field_expression: ($) =>
      prec(PREC.postfix, seq(field("value", $._expression), ".", field("field", $.identifier))),

    // `e?` — propagate a `Result`'s error to the caller. Desugars to a `match`, and names
    // `Result::Ok` and `Result::Err` by name, so the compiler holds no table of lang items.
    try_expression: ($) => prec(PREC.postfix, seq($._expression, "?")),

    struct_literal: ($) =>
      seq(
        field("type", choice($.type_identifier, $.path_expression)),
        field("body", $.field_initializer_list),
      ),

    field_initializer_list: ($) =>
      seq("{", commaSep($.field_initializer), optional(","), "}"),

    field_initializer: ($) =>
      seq(field("name", $.identifier), ":", field("value", $._expression)),

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

    loop_header: ($) => seq("(", commaSep($.loop_binding), ")"),

    loop_binding: ($) =>
      seq(
        field("name", $.identifier),
        optional(seq(":", field("type", $._type))),
        "=",
        field("value", $._expression),
      ),

    break_expression: ($) => prec.right(seq("break", optional($._expression))),

    continue_expression: ($) =>
      prec.right(seq("continue", optional(seq("(", commaSep($._expression), ")")))),

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

    element_open: ($) => seq("<", field("name", $.identifier), repeat($.element_attribute), ">"),

    element_self_closing: ($) =>
      seq("<", field("name", $.identifier), repeat($.element_attribute), "/>"),

    element_close: ($) => seq("</", field("name", $.identifier), ">"),

    // A bare attribute name is not shorthand for anything: every attribute is typed, so
    // there would be nothing for it to mean.
    element_attribute: ($) =>
      seq(field("name", $.identifier), "=", field("value", choice($.string, $.element_value))),

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
      seq(field("type", $.path_pattern), "(", commaSep($._pattern), ")"),

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
    string: ($) => seq('"', repeat(choice($.escape_sequence, /[^"\\\n]+/)), '"'),

    escape_sequence: (_) => token.immediate(/\\[nrt0\\"]/),
  },
});

function commaSep(rule) {
  return optional(commaSep1(rule));
}

function commaSep1(rule) {
  return sep1(rule, ",");
}

function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}
