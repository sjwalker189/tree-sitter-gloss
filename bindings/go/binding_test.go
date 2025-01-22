package tree_sitter_gloss_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_gloss "github.com/tree-sitter/tree-sitter-gloss/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_gloss.Language())
	if language == nil {
		t.Errorf("Error loading Gloss grammar")
	}
}
