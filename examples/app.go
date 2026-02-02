package examples

type App[T any] struct {
	Value T
}

type Opt bool

func foo() {}

func main() *App[any] {
	foo()
	return nil
}
