/**
 * @file Gloss grammar for tree-sitter
 * @author Sam Walker <sjwalker189@gmail.com>amm* @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Helper functions (standard practice in Go and Rust tree-sitter grammars)
function commaSep(rule) {
  return optional(commaSep1(rule));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(",", rule)));
}

const PREC = {
  assign: 1,
  logical_or: 2, // ||
  logical_and: 3, // &&
  bitwise_or: 4, // |
  bitwise_xor: 5, // ^
  bitwise_and: 6, // &
  equality: 7, // ==, !=  (Usually lower than <, >)
  relational: 8, // <, <=, >, >=
  shift: 9, // <<, >>
  add: 10, // +, -
  mult: 11, // *, /, %
  unary: 12, // !, -, +, ~
  call: 13,
  member: 14,
  postfix: 15,
  index: 16,
};

module.exports = grammar({
  name: "gloss",

  // Ignore whitespace and comments automatically
  extras: ($) => [/\s/, $.comment],

  // Newline-based statement termination (Go-style ASI). The external scanner
  // emits this zero-width token at statement boundaries (newline / EOF / `}`).
  externals: ($) => [$._automatic_semicolon],

  conflicts: ($) => [
    // A trailing `call_expression` may be a statement or the block's value
    // expression; both are valid and lower identically.
    [$._statement, $.expression],
    [$.expression, $.composite_literal],
    [$.expression, $._jsx_element_name],
    [$.unary_expression, $.binary_expression, $.call_expression],
    [$.update_expression, $.binary_expression, $.call_expression],
    [$.binary_expression, $.call_expression],
    [$.generic_type, $.expression],
    [$._type, $.expression],
    [$.tuple_type, $.tuple_expression],
  ],

  supertypes: ($) => [
    $.expression,
    $._declaration,
    $._statement,
    $.number,
    $._pattern,
  ],

  reserved: {
    global: ($) => [
      // Control flow
      "break",
      "continue",
      "return",
      "if",
      "else",
      "for",
      "while",
      "loop",
      "match",

      // Declarations
      "let",
      "const",
      "fn",
      "struct",
      "enum",
      "union",
      "type",
      "use",
      "renderer",

      // Modifiers
      "extern",
      "mut",
    ],
  },

  rules: {
    // ------------------------------------------------------------------------
    // Top-Level
    // ------------------------------------------------------------------------
    source_file: ($) => repeat($._declaration),

    comment: ($) => token(seq("//", /.*/)),

    _declaration: ($) =>
      choice(
        $.use_declaration,
        $.type_declaration,
        $.enum_declaration,
        $.union_declaration,
        $.struct_declaration,
        $.renderer_declaration,
        $.function_declaration,
        $.constant_declaration,
        $.variable_declaration,
      ),

    // ------------------------------------------------------------------------
    // Declarations
    // ------------------------------------------------------------------------
    use_declaration: ($) => seq("use", field("module", $.string)),

    type_declaration: ($) =>
      seq(
        optional("extern"),
        optional($.visibility_modifier),
        "type",
        field("name", $.type_identifier),
        optional(field("type_parameters", $.type_parameters)),
        field("type", $._type),
      ),

    // Enums
    enum_declaration: ($) =>
      seq(
        optional("extern"),
        optional($.visibility_modifier),
        "enum",
        field("name", $.type_identifier),
        field("body", $.enum_body),
      ),
    enum_body: ($) => seq("{", commaSep($.enum_variant), optional(","), "}"),
    enum_variant: ($) =>
      seq(
        field("name", $.type_identifier),
        optional(seq("=", field("value", $.expression))),
      ),

    // Unions
    union_declaration: ($) =>
      seq(
        optional("extern"),
        optional($.visibility_modifier),
        "union",
        field("name", $.type_identifier),
        optional(field("type_parameters", $.type_parameters)),
        field("body", $.union_body),
      ),
    union_body: ($) => seq("{", commaSep($.union_variant), optional(","), "}"),
    // Variants mirror Rust enums: unit (`None`), tuple (`Some(T)`,
    // `Pair(int, string)`), or struct (`On { value: T }`).
    union_variant: ($) =>
      seq(
        field("name", $.type_identifier),
        optional(field("payload", choice($.tuple_payload, $.struct_payload))),
      ),
    tuple_payload: ($) =>
      seq("(", commaSep1($._type), optional(","), ")"),
    struct_payload: ($) =>
      seq("{", commaSep($.field_declaration), optional(","), "}"),

    slice_type: ($) =>
      seq(
        "[",
        optional(field("size", $.int_literal)),
        "]",
        field("element", $._type),
      ),

    // Structs
    //
    // The body is optional so `extern struct Request` declares an opaque
    // host-provided type: known by name, with no readable fields. The compiler
    // restricts the bodyless form to `extern`; the grammar stays permissive and lets
    // it say so, which keeps a half-typed declaration parsing while it is edited.
    struct_declaration: ($) =>
      seq(
        optional("extern"),
        optional($.visibility_modifier),
        "struct",
        field("name", $.type_identifier),
        optional(field("type_parameters", $.type_parameters)),
        optional(field("body", $.struct_body)),
      ),

    struct_body: ($) =>
      seq(
        "{",
        repeat(
          choice(
            seq($.field_declaration, optional(",")),
            alias($._method_declaration, $.function_declaration),
          ),
        ),
        "}",
      ),

    // A field name is usually an identifier. An attribute schema declares the names
    // it accepts, though, so a field may also carry a compound or quoted name — see
    // `compound_field_name`.
    field_declaration: ($) =>
      seq(
        field("name", choice($.identifier, $.compound_field_name, $.string)),
        // Optional fields (`name?: T`) — used by attribute record types so a
        // renderer can mark element attributes as not required.
        optional(field("optional", "?")),
        ":",
        field("type", $._type),
      ),

    // A compound field name, for an attribute schema declaring the names it accepts:
    // `aria-hidden?: string`, `x-data?: string`, `@click?: string`, `:class?: string`.
    //
    // Unlike `compound_attribute_name` this excludes an internal `:`, because in field
    // position `:` introduces the type. `x-transition:enter: string` has no
    // unambiguous reading, and permitting it would make `{a:b}` lex as one name
    // followed by a missing type. Such an attribute is declared with a quoted name
    // instead — `"x-transition:enter"?: string` — which is why `field_declaration`
    // also accepts a string.
    //
    // A leading `:` sigil is still fine: nothing else can start a field name, so
    // `:class` is unambiguous.
    compound_field_name: ($) =>
      token(
        choice(
          /[@:][a-zA-Z_][a-zA-Z0-9_]*([-.][a-zA-Z_][a-zA-Z0-9_]*)*/,
          /[a-zA-Z_][a-zA-Z0-9_]*([-.][a-zA-Z_][a-zA-Z0-9_]*)+/,
        ),
      ),

    // Renderers
    //
    // A renderer declares the type surface of a rendering backend: its method
    // signatures (bodyless) and the intrinsic elements it understands, each with
    // a typed attribute schema. Declaration-only — the backend supplies the impl.
    renderer_declaration: ($) =>
      seq(
        optional("extern"),
        optional($.visibility_modifier),
        "renderer",
        field("name", $.type_identifier),
        field("body", $.renderer_body),
      ),

    // A renderer declares its element vocabulary only. Text/Fragment and the
    // like are runtime methods the backend impl provides, not type surface.
    renderer_body: ($) => seq("{", repeat($.element_declaration), "}"),

    element_declaration: ($) =>
      seq(
        "element",
        field("tag", $.identifier),
        ":",
        field("attrs", $._attr_type),
      ),

    // Functions
    //
    // Top level only — a struct method is `_method_declaration` below. The body is
    // optional here so `extern fn Raw(props: RawProps) Element` parses: a
    // host-provided declaration has no body, because the host supplies it.
    //
    // No ambiguity follows from that at top level, since every declaration begins
    // with a keyword. Whatever comes after a bodyless signature cannot be mistaken
    // for a return type.
    function_declaration: ($) =>
      seq(
        optional("extern"),
        optional($.visibility_modifier),
        "fn",
        // Capitalized names are allowed so JSX component functions (`fn Heading`)
        // parse; capitalization is what distinguishes a component from an intrinsic
        // element.
        field("name", choice($.identifier, $.type_identifier)),
        optional(field("type_parameters", $.type_parameters)),
        field("parameters", $.parameter_list),
        optional(field("return_type", $._type)),
        optional(field("body", $.block)),
      ),

    // A struct method. Aliased to `function_declaration`, so the tree keeps the shape
    // the compiler's own CST produces, but declared separately because a method
    // differs in two ways that matter to the parser:
    //
    //   - It is never `extern`. The compiler rejects methods on an extern struct, and
    //     a non-extern struct's methods are ordinary ones.
    //   - Its body is required. Sharing the optional-body rule made `fn m() foo`
    //     inside a struct body unresolvable — `foo` could be the return type, or the
    //     name of the next field.
    _method_declaration: ($) =>
      seq(
        optional($.visibility_modifier),
        "fn",
        field("name", choice($.identifier, $.type_identifier)),
        optional(field("type_parameters", $.type_parameters)),
        field("parameters", $.parameter_list),
        optional(field("return_type", $._type)),
        field("body", $.block),
      ),

    visibility_modifier: ($) => "private",

    parameter_list: ($) => seq("(", commaSep($.parameter_declaration), ")"),

    parameter_declaration: ($) =>
      seq(
        field("name", $.identifier),
        optional(seq(":", field("type", $._type))),
      ),

    // Variables
    variable_declaration: ($) =>
      seq(
        optional(field("visibility", $.visibility_modifier)),
        "let",
        field("name", $.identifier),
        optional(seq(":", field("type", $._type))),
        "=",
        field("value", $.expression),
      ),

    constant_declaration: ($) =>
      seq(
        optional(field("visibility", $.visibility_modifier)),
        "const",
        field("name", $.identifier),
        optional(seq(":", field("type", $._type))),
        "=",
        field("value", $.expression),
      ),

    // ------------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------------
    _type: ($) =>
      choice(
        $.identifier,
        $.type_identifier,
        $.generic_type,
        $.primitive_type,
        $.slice_type,
        $.tuple_type,
        $.reference_type,
      ),

    // A reference type: `&T` (shared) or `&mut T` (mutable). No lifetimes — the
    // GC'd backend keeps the referent alive; `mut` is intent only and unchecked.
    reference_type: ($) =>
      prec.right(
        PREC.unary,
        seq("&", optional("mut"), field("inner", $._type)),
      ),

    // Attribute-schema types. Kept separate from `_type` because a record type
    // (`{ ... }`) would otherwise collide with blocks and composite literals
    // wherever a type precedes `{`. Only renderer element schemas use these.
    _attr_type: ($) =>
      choice($.type_identifier, $.record_type, $.intersection_type),

    // An anonymous record type, e.g. `{ href: string, disabled?: bool }`.
    record_type: ($) =>
      seq("{", commaSep($.field_declaration), optional(","), "}"),

    // Type intersection, e.g. `GlobalAttrs & { href: string }`. Lets an element
    // compose a shared attribute set with element-specific attributes.
    intersection_type: ($) =>
      prec.left(
        PREC.bitwise_and,
        seq(field("left", $._attr_type), "&", field("right", $._attr_type)),
      ),

    primitive_type: ($) => choice("int", "string", "bool", "void", "nil"),

    tuple_type: ($) => seq("(", commaSep($._type), ")"),

    generic_type: ($) =>
      seq(
        field("name", choice($.identifier, $.type_identifier)),
        field("type_arguments", $.type_arguments),
      ),

    type_parameters: ($) => seq("<", commaSep1($.type_identifier), ">"),

    type_arguments: ($) => seq("<", commaSep1($._type), ">"),

    // ------------------------------------------------------------------------
    // Statements & Blocks
    // ------------------------------------------------------------------------
    // Statements are newline-terminated (see `externals`); a final unterminated
    // expression is the block's value (Rust-like). The trailing expression may
    // also absorb the terminator the scanner emits just before `}`.
    block: ($) =>
      seq(
        "{",
        repeat(seq($._statement, $._automatic_semicolon)),
        optional(seq($.expression, optional($._automatic_semicolon))),
        "}",
      ),

    _statement: ($) =>
      choice(
        $.constant_declaration,
        $.variable_declaration,
        $.assignment_statement,
        $.call_expression,
        $.return_statement,
        $.if_statement,
        $.loop_statement,
        $.while_statement,
        $.for_statement,
        $.for_in_statement,
        // A side-effecting `match` mid-block. It is an expression too, and was reachable
        // only as a block's trailing value or inside a JSX interpolation — so a `match`
        // written for its arms' effects did not parse.
        $.match_expression,
        $.break_statement,
        $.continue_statement,
      ),

    // A function may return multiple values (`return 0, "ok"`), matching the
    // tuple return type `(int, string)`.
    return_statement: ($) =>
      prec.right(seq("return", optional(commaSep1($.expression)))),

    assignment_statement: ($) =>
      seq(
        field(
          "left",
          choice($.identifier, $.member_expression, $.index_expression),
        ),
        field(
          "operator",
          choice(
            "=",
            "+=",
            "-=",
            "*=",
            "/=",
            "%=",
            "<<=",
            ">>=",
            "&=",
            "|=",
            "^=",
          ),
        ),
        field("right", $.expression),
      ),

    if_statement: ($) =>
      seq(
        "if",
        field("condition", $.expression),
        field("consequence", $.block),
        optional(
          seq("else", field("alternative", choice($.block, $.if_statement))),
        ),
      ),

    loop_statement: ($) => seq("loop", $.block),

    while_statement: ($) =>
      seq("while", field("condition", $.expression), field("body", $.block)),

    for_statement: ($) =>
      seq(
        "for",
        optional(
          field("initializer", choice($.variable_declaration, $.expression)),
        ),
        ";",
        optional(field("condition", $.expression)),
        ";",
        optional(field("update", $.expression)),
        field("body", $.block),
      ),

    // One name binds the value (`for card in cards`), two bind index and value
    // (`for i, card in cards`). The single-name form is the common one in templates,
    // and binding the value rather than the index is what Rust does — iterating a
    // collection to get its elements, not its positions.
    //
    // `value` is therefore always the element; `index` is present only in the
    // two-name form.
    for_in_statement: ($) =>
      seq(
        "for",
        choice(
          field("value", $.identifier),
          seq(field("index", $.identifier), ",", field("value", $.identifier)),
        ),
        "in",
        field("right", $.expression),
        field("body", $.block),
      ),

    break_statement: ($) => "break",
    continue_statement: ($) => "continue",

    // ------------------------------------------------------------------------
    // Expressions
    // ------------------------------------------------------------------------
    expression: ($) =>
      choice(
        $.string,
        $.number,
        $.boolean,
        $.unary_expression,
        $.binary_expression,
        $.update_expression,
        $.parenthesized_expression,
        $.tuple_expression,
        $.composite_literal,
        $.call_expression,
        $.member_expression,
        $.optional_member_expression,
        $.index_expression,
        $.optional_index_expression,
        $.match_expression,
        $.if_statement, // `if`/`else` as a value (Rust-like block expression)
        $.anonymous_function,
        $.jsx_element, // <div>...</div>
        $.jsx_self_closing_element, // <br />
        $.jsx_fragment, // <>...</>
        $.type_identifier,
        $.identifier,
      ),

    // prec(1) eagerly binds the `{` to the type identifier so it doesn't
    // prematurely end `let` declarations.
    composite_literal: ($) =>
      seq(
        field(
          "type",
          choice($.identifier, $.type_identifier, $.generic_type, $.slice_type),
        ),
        field("body", $.literal_body),
      ),

    literal_body: ($) =>
      seq(
        "{",
        optional(
          choice(
            commaSep1($.field_value), // For structs: { field: value, }
            commaSep1($.expression), // For slices: { 1, 2, 3 }
          ),
        ),
        optional(","),
        "}",
      ),

    field_value: ($) =>
      seq(field("name", $.identifier), ":", field("value", $.expression)),

    unary_expression: ($) =>
      prec(
        PREC.unary,
        seq(
          field("operator", choice("-", "+", "!", "~")),
          field("argument", $.expression),
        ),
      ),

    binary_expression: ($) =>
      choice(
        ...[
          ["*", PREC.mult],
          ["/", PREC.mult],
          ["%", PREC.mult],
          ["+", PREC.add],
          ["-", PREC.add],
          ["<<", PREC.shift],
          [">>", PREC.shift],
          ["<", PREC.relational],
          ["<=", PREC.relational],
          [">", PREC.relational],
          [">=", PREC.relational],
          ["==", PREC.equality],
          ["!=", PREC.equality],
          ["&", PREC.bitwise_and],
          ["^", PREC.bitwise_xor],
          ["|", PREC.bitwise_or],
          ["&&", PREC.logical_and],
          ["||", PREC.logical_or],
        ].map(([operator, precedence]) =>
          prec.left(
            precedence,
            seq(
              field("left", $.expression),
              field("operator", operator),
              field("right", $.expression),
            ),
          ),
        ),
      ),

    update_expression: ($) =>
      choice(
        prec.left(
          PREC.postfix,
          seq(
            field("argument", $.expression),
            field("operator", choice("++", "--")),
          ),
        ),
        prec.right(
          PREC.unary,
          seq(
            field("operator", choice("++", "--")),
            field("argument", $.expression),
          ),
        ),
      ),

    member_expression: ($) =>
      prec.left(
        PREC.member,
        seq(
          field("object", $.expression),
          ".",
          field("property", $.property_identifier),
        ),
      ),

    optional_member_expression: ($) =>
      prec.left(
        PREC.member,
        seq(
          field("object", $.expression),
          "?.",
          field("property", $.property_identifier),
        ),
      ),

    parenthesized_expression: ($) => seq("(", $.expression, ")"),

    tuple_expression: ($) =>
      seq(
        "(",
        optional(
          choice(
            seq($.expression, ","),
            seq($.expression, ",", commaSep1($.expression), optional(",")),
          ),
        ),
        ")",
      ),

    call_expression: ($) =>
      prec.left(
        PREC.call,
        seq(
          field("function", $.expression),
          optional(field("type_parameters", $.type_arguments)),
          field("arguments", $.argument_list),
        ),
      ),

    index_expression: ($) =>
      prec.left(
        PREC.index,
        seq(
          field("operand", $.expression),
          "[",
          field("index", $.expression),
          "]",
        ),
      ),
    optional_index_expression: ($) =>
      prec.left(
        PREC.index,
        seq(
          field("operand", $.expression),
          "?.",
          "[",
          field("index", $.expression),
          "]",
        ),
      ),

    match_expression: ($) =>
      seq("match", field("value", $.expression), field("body", $.match_body)),

    match_body: ($) =>
      seq(
        "{",
        optional(
          seq(
            $.match_arm,
            repeat(seq(optional(","), $.match_arm)),
            optional(","),
          ),
        ),
        "}",
      ),

    match_arm: ($) =>
      seq(
        field("pattern", $._pattern),
        "=>",
        field("value", choice($.expression, $.block)),
      ),

    // --- PATTERNS ---
    _pattern: ($) =>
      choice(
        alias("_", $.catch_all_pattern),
        $.number,
        $.string,
        $.boolean,
        $.identifier,
        $.enum_pattern,
      ),

    // Mirrors union variants: tuple destructuring (`Some(n)`) or struct
    // destructuring (`On { value }`, `On { value: v }`).
    enum_pattern: ($) =>
      seq(
        field("name", $.type_identifier),
        optional(
          choice(
            seq("(", commaSep($._pattern), ")"),
            $.struct_pattern,
          ),
        ),
      ),
    // A trailing `..` (rest_pattern) ignores any unmatched fields.
    struct_pattern: ($) =>
      seq(
        "{",
        commaSep(choice($.field_pattern, $.rest_pattern)),
        optional(","),
        "}",
      ),
    rest_pattern: ($) => "..",
    field_pattern: ($) =>
      choice(
        seq(
          field("name", $.identifier),
          ":",
          field("pattern", $._pattern),
        ),
        field("name", $.identifier),
      ),

    anonymous_function: ($) =>
      seq(
        "fn",
        optional(field("type_parameters", $.type_parameters)),
        field("parameters", $.parameter_list),
        optional(field("return_type", $._type)),
        field("body", $.block),
      ),

    argument_list: ($) =>
      seq("(", optional(seq(commaSep($._argument), optional(","))), ")"),

    _argument: ($) =>
      choice($.expression, $.labeled_argument, $.punned_argument),

    // Standard labeled argument: a: 5
    labeled_argument: ($) =>
      seq(field("label", $.identifier), ":", field("value", $.expression)),

    // Punned argument: :a
    punned_argument: ($) => seq(":", field("label", $.identifier)),

    // Elements
    jsx_element: ($) =>
      seq($.jsx_opening_element, repeat($._jsx_child), $.jsx_closing_element),

    // 2. Fragments: <> Hello </>
    jsx_fragment: ($) => seq("<", ">", repeat($._jsx_child), "<", "/", ">"),

    // 3. Self-closing: <input type="text" />
    jsx_self_closing_element: ($) =>
      seq(
        "<",
        field("name", $._jsx_element_name),
        repeat(field("attribute", $.jsx_attribute)),
        "/",
        ">",
      ),

    jsx_opening_element: ($) =>
      seq(
        "<",
        field("name", $._jsx_element_name),
        repeat(field("attribute", $.jsx_attribute)),
        ">",
      ),

    jsx_closing_element: ($) =>
      seq("<", "/", field("name", $._jsx_element_name), ">"),

    // JSX element names can be lowercase (div), uppercase (Button), or members (UI.Button)
    _jsx_element_name: ($) =>
      choice($.identifier, $.type_identifier, $.member_expression),

    // Attributes: id="main", onClick={handleClick}, aria-hidden={true}, @click="go"
    //
    // A plain name stays an `identifier`, including a keyword-spelled one like
    // `type` or `for`. A compound name is its own token — see
    // `compound_attribute_name`.
    jsx_attribute: ($) =>
      seq(
        field("name", choice($.identifier, $.compound_attribute_name)),
        optional(seq("=", field("value", choice($.string, $.jsx_expression)))),
      ),

    // A compound attribute name: an optional `@` or `:` sigil, an identifier, then
    // any run of `-`, `.` or `:` segments. Covers ARIA (`aria-hidden`), data
    // attributes (`data-sitekey`), SVG presentation attributes (`stroke-width`),
    // and framework syntax (`x-data`, `@click.outside`, `:class`,
    // `x-transition:enter`).
    //
    // One token, matching the compiler, which scans the whole name from raw source
    // rather than assembling it from pieces — the name has to reach the renderer's
    // attribute schema as a single string to be looked up in it.
    //
    // At least one sigil or separator is required, so a plain name cannot also match
    // this. Without that the lexer would face a same-length tie between the two
    // tokens on every ordinary attribute.
    compound_attribute_name: ($) =>
      token(
        choice(
          // Sigil-led: `@click`, `@click.outside`, `:class`, `:aria-expanded`.
          /[@:][a-zA-Z_][a-zA-Z0-9_]*([-.:][a-zA-Z_][a-zA-Z0-9_]*)*/,
          // Separated: `aria-hidden`, `stroke-width`, `x-transition:enter`.
          /[a-zA-Z_][a-zA-Z0-9_]*([-.:][a-zA-Z_][a-zA-Z0-9_]*)+/,
        ),
      ),

    // Inside a JSX tag, you can have text, nested JSX, or a Gloss expression
    _jsx_child: ($) =>
      choice(
        $.jsx_text,
        $.jsx_element,
        $.jsx_self_closing_element,
        $.jsx_fragment,
        $.jsx_expression,
      ),

    // { user.name }
    jsx_expression: ($) =>
      seq(
        "{",
        repeat(seq($._statement, $._automatic_semicolon)),
        optional(seq($.expression, optional($._automatic_semicolon))),
        "}",
      ),

    // Plain text: Matches anything that isn't a `<` or `{`
    jsx_text: ($) => /[^{<]+/,

    // ------------------------------------------------------------------------
    // Primitives / Terminals
    // ------------------------------------------------------------------------
    identifier: ($) => /[a-z_][a-zA-Z0-9_]*/,
    blank_identifier: ($) => "_",
    property_identifier: ($) => /[a-zA-Z_][a-zA-Z0-9_]*/,
    type_identifier: ($) => /[A-Z][a-zA-Z0-9_]*/,

    // Interpolation opens with `${`, not a bare `{`.
    //
    // A bare brace has to stay literal: strings routinely carry markup for other
    // languages that use braces — an Alpine `x-data="{ open: false }"`, a CSS rule —
    // and making `{` special would break every one of them, or force escaping
    // throughout. `${` occurs in none of them, and is the spelling JS template
    // literals and shell already use.
    //
    // `\${` is a literal `${`, since the escape rule consumes the `$`.
    string: ($) =>
      seq(
        '"',
        repeat(
          choice(
            // Normal text: anything that isn't a quote, backslash, newline, or `$`.
            // `$` is split out so `${` can be recognized. A lone `$` matches the second
            // alternative and stays literal — `${` wins by being the longer match, so
            // `"costs $5"` needs no escaping.
            token.immediate(prec(1, /[^\\"\n$]+/)),
            token.immediate(prec(1, /\$/)),

            $.escape_sequence,
            $.string_interpolation,
          ),
        ),
        '"',
      ),

    string_interpolation: ($) =>
      seq(token.immediate(prec(2, "${")), field("expression", $.expression), "}"),

    escape_sequence: ($) =>
      token.immediate(
        seq(
          "\\",
          choice(
            /[^xuU]/, // Standard escapes like \n, \t, \r, \\, \"
            /u[0-9a-fA-F]{4}/, // Unicode escapes like \u00A9
            /U[0-9a-fA-F]{8}/, // Long Unicode escapes
            /x[0-9a-fA-F]{2}/, // Hex escapes like \x1F
          ),
        ),
      ),
    boolean: ($) => choice("true", "false"),
    nil: ($) => "nil",

    // Numbers

    number: ($) => choice($.float_literal, $.int_literal),

    // Priority 2: Floats (Must be higher than Int to catch '1.0' before '1')
    float_literal: ($) =>
      token(
        choice(
          // 1. Decimal floats with a dot (e.g., 1.0, 1., 1.23, 1.2e-5)
          //    Matches: Digits + Dot + Optional Digits + Optional Exponent
          /\d+(_?\d+)*\.(\d+(_?\d+)*)?([eE][+-]?\d+(_?\d+)*)?/,

          // 2. Decimal floats starting with a dot (e.g., .5, .2e+5)
          /\.\d+(_?\d+)*([eE][+-]?\d+(_?\d+)*)?/,

          // 3. Scientific notation without a dot (e.g., 1e5)
          /\d+(_?\d+)*[eE][+-]?\d+(_?\d+)*/,

          // 4. Hexadecimal floats (e.g., 0x1.fp-5)
          /0[xX][0-9a-fA-F]+(_?[0-9a-fA-F])*\.?[0-9a-fA-F]*(_?[0-9a-fA-F])*[pP][+-]?\d+(_?\d+)*/,
        ),
      ),

    // Priority 1: Integers
    int_literal: ($) =>
      token(
        choice(
          prec(2, /0[xX](_?[0-9a-fA-F])+/),
          prec(2, /0[bB](_?[01])+/),
          prec(2, /0[oO](_?[0-7])+/),
          prec(1, /[0-9](_?\d+)*/),
        ),
      ),
  },
});
