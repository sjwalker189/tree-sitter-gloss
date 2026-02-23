/**
 * @file Gloss grammar for tree-sitter
 * @author Sam Walker <sjwalker189@gmail.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check
// prettier-ignore

const PREC = {
  primary: 7,
  unary: 6,
  multiplicative: 5,
  additive: 4,
  comparative: 3,
  and: 2,
  or: 1,
  composite_literal: -1,
};

module.exports = grammar({
  name: "gloss",

  extras: ($) => [/\s/, $.comment],

  word: ($) => $.identifier,

  rules: {
    source_file: ($) => repeat($._declaration),

    // --- Declarations ---
    _top_level_declaration: ($) => choice($.struct_declaration),

    struct_declaration: ($) =>
      seq(
        "struct",
        $._type_identifier,
        optional($.type_parameters),
        $.struct_body,
      ),

    struct_type: ($) =>
      seq("struct", optional($.type_parameters), $.struct_body),

    struct_body: ($) => seq("{", sepBy(",", $.field_declaration), "}"),

    field_declaration: ($) =>
      seq(
        field("name", $._field_identifier),
        ":",
        field(
          "type",
          choice($._type_identifier, $.qualified_type, $.generic_type),
        ),
      ),

    type_parameters: ($) =>
      seq("<", sepBy(",", $.type_parameter_declaration), ">"),

    type_parameter_declaration: ($) =>
      seq($.type_identifier, optional($.type_reference)),

    type_identifier: ($) => alias($.identifier, "type_identifier"),

    type_arguments: ($) => seq(">", sepBy(",", $.type_reference), ">"),

    type_reference: ($) => seq($.type_identifier, optional($.type_arguments)),

    generic_type: ($) => seq($.type_identifier, $.type_arguments),

    qualified_type: ($) =>
      seq(
        field("package", $._package_identifier),
        ".",
        field("name", $._type_identifier),
      ),

    literal_value: ($) =>
      seq(
        "{",
        optional(
          seq(
            sepBy(",", choice($.literal_element, $.keyed_element)),
            optional(","),
          ),
        ),
        "}",
      ),

    literal_element: ($) => choice($._expression, $.literal_value),

    keyed_element: ($) =>
      seq(
        field("key", $.literal_element),
        ":",
        field("value", $.literal_element),
      ),

    composite_literal: ($) =>
      prec(
        PREC.composite_literal,
        seq(
          field(
            "type",
            choice(
              // $.slice_type,
              // $.array_type,
              // $.struct_type,
              $._type_identifier,
              $.type_reference,
              $.qualified_type,
            ),
          ),
          field("body", $.literal_value),
        ),
      ),

    // --- Statements ---
    _statement: ($) => choice(),

    // --- Expressions ---
    _expression: ($) =>
      choice(
        $.boolean,
        $.composite_literal,
        $.unary_expression,
        $.binary_expression,
        $.primary_expression,
        $.struct_expression,
        $.call_expression,
      ),

    binary_expression: ($) =>
      choice(
        ...[
          ["*", 4],
          ["/", 4],
          ["+", 3],
          ["-", 3],
        ].map(([operator, precedence]) =>
          prec.left(
            precedence,
            seq(
              field("left", $._expression),
              field("operator", operator),
              field("right", $._expression),
            ),
          ),
        ),
      ),

    unary_expression: ($) =>
      prec(
        6,
        seq(
          field("operator", choice("-", "+")),
          field("argument", $._expression),
        ),
      ),

    primary_expression: ($) =>
      choice($.parenthesized_expression, $.identifier, $._number, $.string),

    parenthesized_expression: ($) => seq("(", $._expression, ")"),

    struct_expression: ($) =>
      prec(
        1,
        seq(
          field("name", $.type_reference),
          field("body", $.field_initilizer_list),
        ),
      ),

    field_initilizer_list: ($) =>
      seq("{", sepBy(",", $.field_initializer), optional(","), "}"),

    field_initializer: ($) =>
      seq(field("name", $.identifier), ":", field("value", $._expression)),

    call_expression: ($) =>
      prec(
        1,
        seq(
          field("name", $.identifier),
          "(",

          // fn sum(1, 2)
          // fn sum(a: 1, b: 2)
          // fn sum(:a, :b)
          optional(
            sepBy(
              ",",
              choice(
                $._expression,
                $.labeled_function_argument,
                $.labeled_function_argument_punned,
              ),
            ),
          ),
          optional(","),
          ")",
        ),
      ),

    labeled_function_argument: ($) =>
      seq(field("label", $.identifier), ":", $._expression),

    labeled_function_argument_punned: ($) =>
      field("label", $.labeled_identifier),

    labeled_identifier: ($) => seq(":", $.identifier),

    // --- Tokens ---
    identifier: ($) => /[a-zA-Z_][a-zA-Z0-9_]*/,

    _type_identifier: ($) => alias($.identifier, $.type_identifier),
    _field_identifier: ($) => alias($.identifier, $.field_identifier),
    _package_identifier: ($) => alias($.identifier, $.package_identifier),

    // --- Numbers ---
    _number: ($) => choice($.float_literal, $.int_literal),

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

    string: ($) => /"([^"\\]|\\.)*"/,

    boolean: ($) => choice("true", "false"),

    nil: ($) => "nil",

    comment: ($) =>
      token(
        choice(seq("//", /.*/), seq("/*", /[^*]*\*+([^/*][^*]*\*+)*/, "/")),
      ),
  },
});

// Helper for comma-separated lists
function sepBy(sep, rule) {
  return optional(seq(rule, repeat(seq(sep, rule))));
}
