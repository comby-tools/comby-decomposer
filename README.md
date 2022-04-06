# comby-decomposer

`comby-decomposer` is a tool that automatically decomposes program syntax into
(1) a set of templates and (2) a set of concrete fragments extracted from the
syntax. Basically, it _un_-substitutes some input file to create a corpus of
templates and fragments. 

Here's a visual example of outputs when we decompose a function with respect to parentheses `(...)` and braces `{...}`.

![decompose](https://user-images.githubusercontent.com/888624/160704921-511c0609-5877-4a8e-ab39-f641baafd846.svg)


You can then use mix-and-match templates and fragments
and substitute these back in to create new combinations of output "programs". It's been most useful [for fuzzing compilers](#why-comby-decomposer-mostly-for-fuzzing-compilers).


## Running

- [Install `comby`](https://github.com/comby-tools/comby#install-pre-built-binaries)
- Install `fdupes` for your distribution (typically `sudo apt-get install fdupes` or `brew install fdupes`)

Copy the programs you want to decompose into the `sources` directory. If you don't have any programs ready, you
can try it with some example programs in this repository:

```bash
cp try_example_solidity/* sources
```

Then, just run:

`./run.sh .sol .sol`

This says "decompose programs for all `.sol` files in the `sources` directory using the `.sol` language (defined by `comby -list`).
You get these outputs:

- `fragments` contains the extracted fragments
- `templates` contains the templatized versions of the input string.

These are deduplicated and unique. You can try the same for example rust programs:

```bash
cp try_example_rust/* sources
./run.sh .rs .rs
```

and check out examples in `templates` and `fragments`!

## Customizing decomposition

By default programs are decomposed around delimiter syntax like `(...)`,
`{...}` and `[...]`. This means that `comby-decomposer` looks for this syntax
and un-substitutes the program around these patterns. It will also look for nested syntax inside these. You can use any comby
pattern you like though! I These patterns are defined inside
`extraction_specifications` using a simple [configuration file](https://comby.dev/docs/configuration) and you'll find the default ones
for parentheses, braces, and brackets in there already. But if you wanted to
un-substitute around numbers in the input program, you can simply add a
specification like `extract_number.toml` that matches the regex `[0-9]+` like this:

```
[extract_number]
match=':[~[0-9]+]'
```

(Tip: the string `:[~[0-9]+]` is just using the [comby syntax](https://comby.dev/docs/syntax-reference) `:[...]` to define a regular expression `[0-9]+`)

Now if you delete the other specifications and `./run.sh .sol .sol` again on
the example program, you'll only get one decomposition (since there's only one
number to un-substitute), and your `templates` and `fragments` folders contain
these:


**templates**

```solidity
function f(uint:[1] arg) public {
        g(notfound);
}
```

**fragments**

```
256
```

### Smaller fragments and templates

If you have many or large programs to decompose, you can run `./postprocess.sh` after `./run.sh`. This will:

- only keep templates and fragments that are 8KB to 28KB in size
- delete templates with no holes
- delete templates with more than 10 holes

Look inside the `postprocess.sh` to customize it.

## On-demand input generation

If you have `templates` and `fragments` and want to randomly generate new
programs by substituting fragments into templates, you can use the included
server. Just run these commands:

```bash
npm install express body-parser @iarna/toml minimist

export NODE_OPTIONS="--max-old-space-size=8192"
node server.js --generate 1.0
```

Then in a separate terminal, request a new input:

`curl -X POST http://localhost:4448/mutate`

Every request generates a random input. The server picks a random template from
the `templates` directory, and substitutes up to `10` random fragments  from
the `fragments` directory. If you want more control over server generation
you'll have to dig into `server.js`.

## Customizing language grammar target

Comby supports a lot of languages (see `comby -list` for supported ones),
but even if you just created one, you'll probably get some mileage from using
the generic parser and default patterns: `./run .my-language-extension .generic`.

## Why `comby-decomposer`? Mostly for fuzzing compilers...

`comby-decomposer` was created to generate inputs to fuzz compilers, but it can
be used for other things too.  The fun part is `comby-decomposer` is
syntax-aware and works on most any language (or structured input like JSON) to
some degree, and you can get started right away: You just need some example
programs for your program. No need to define a grammar to generate inputs, or
know exactly how the grammar of your target language works. That's because it
just uses [Comby](https://github.com/comby-tools/comby) to do the decomposition
work. 


The basic idea is that `comby-decomposer` creates inputs _that are much more
likely to be syntactically valid expressions_ inside _previously valid (now
templatized) programs_. Generating inputs with templates and likely-valid
expressions help nudge a feedback-directed fuzzer (like AFL) to explore
"deeper" code in a compiler _earlier_ than, say, just starting with a
compiler's initial test suite. So, instead of using only an initial test
corpus, `comby-decomposer` helps generate templates and fragments for
synthesizing new test programs on demand. It banks on the idea that these
inputs are unlikely to be generated early (or at all) by default input
mutations in a fuzzer's feedback loop.

For example, `comby-decomposer` generated this Solidity program that [sent the compiler into an infinite loop](https://github.com/ethereum/solidity/issues/10732):

```solidity
contract C {
    bytes32 constant x = x;
    function f() public pure returns (uint t) {
        assembly {
            t := x
        }
    }
}
```

It also generated new valid-looking programs using the Zig compiler's test suite
to find crashes deeper in the analysis and code generation phases of the compiler:

```zig
export fn entry() void {
	var x = false;
    const p = @ptrCast(?*u0, &x);
    return p < null;
}
```

You can find more Zig examples [here](https://github.com/ziglang/zig/issues/10121).
