fn noop() {}

fn main() {
    match { let x = false; x } {
        true => noop(),
        false => {},
    }
}
