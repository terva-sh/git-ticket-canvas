package auth

import "context"

// key is this package's own context key type, so nothing else can collide with
// it or read it by guessing a string.
type key struct{}

// With carries an authenticated identity down the handler chain.
func With(ctx context.Context, identity Identity) context.Context {
	return context.WithValue(ctx, key{}, identity)
}

// From answers who a request is from.
//
// The second return is false for a request that was never authenticated, which
// on a served canvas means it did not come through Guard. A caller that treats
// the zero Identity as a person gives every unauthenticated request one shared
// empty subject, so the boolean is the whole point of the signature.
func From(ctx context.Context) (Identity, bool) {
	identity, ok := ctx.Value(key{}).(Identity)
	return identity, ok
}
