package examples

type App[T any] struct {
	Value T
}

type Opt bool

func foo() {}

func main() *App[int] {
	app := App[int]{
		Value: 1,
	}

	foo()
	return &app
}
