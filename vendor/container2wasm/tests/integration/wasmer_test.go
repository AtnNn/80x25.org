package integration

import (
	"os"
	"path/filepath"
	"testing"

	"gotest.tools/v3/assert"

	"github.com/ktock/container2wasm/tests/integration/utils"
)

func TestWasmer(t *testing.T) {
	utils.RunTestRuntimes(t, []utils.TestSpec{
		{
			Name:    "wasmer-hello",
			Runtime: "wasmer",
			Inputs: []utils.Input{
				{Image: "alpine:3.17", Architecture: utils.X86_64},
				{Image: "riscv64/alpine:20221110", ConvertOpts: []string{"--target-arch=riscv64"}, Architecture: utils.RISCV64},
			},
			Args: utils.StringFlags("--", "--no-stdin", "echo", "-n", "hello"), // wasmer requires "--" before flags we pass to the wasm program.
			Want: utils.WantString("hello"),
		},
		// NOTE: stdin unsupported on wasmer
		// TODO: support it
		{
			Name:    "wasmer-mapdir",
			Runtime: "wasmer",
			Inputs: []utils.Input{
				{Image: "alpine:3.17", Architecture: utils.X86_64},
				{Image: "riscv64/alpine:20221110", ConvertOpts: []string{"--target-arch=riscv64"}, Architecture: utils.RISCV64},
			},
			Prepare: func(t *testing.T, env utils.Env) {
				mapdirTestDir := filepath.Join(env.Workdir, "wasmer-mapdirtest/testdir")
				assert.NilError(t, os.MkdirAll(mapdirTestDir, 0755))
				assert.NilError(t, os.WriteFile(filepath.Join(mapdirTestDir, "hi"), []byte("teststring"), 0755))
			},
			Finalize: func(t *testing.T, env utils.Env) {
				mapdirTestDir := filepath.Join(env.Workdir, "wasmer-mapdirtest/testdir")
				assert.NilError(t, os.Remove(filepath.Join(mapdirTestDir, "hi")))
				assert.NilError(t, os.Remove(mapdirTestDir))
			},
			RuntimeOpts: func(t *testing.T, env utils.Env) []string {
				return []string{"--mapdir=/mapped/dir/test::" + filepath.Join(env.Workdir, "wasmer-mapdirtest/testdir")}
			},
			Args: utils.StringFlags("--", "--no-stdin", "cat", "/mapped/dir/test/hi"),
			Want: utils.WantString("teststring"),
		},
		{
			Name:    "wasmer-env",
			Runtime: "wasmer",
			Inputs: []utils.Input{
				{Image: "alpine:3.17", Architecture: utils.X86_64},
				{Image: "riscv64/alpine:20221110", ConvertOpts: []string{"--target-arch=riscv64"}, Architecture: utils.RISCV64},
			},
			RuntimeOpts: utils.StringFlags("--env=AAA=hello", "--env=BBB=world"),
			Args:        utils.StringFlags("--", "--no-stdin", "/bin/sh", "-c", "echo -n $AAA $BBB"), // wasmer requires "--" before flags we pass to the wasm program.
			Want:        utils.WantString("hello world"),
		},
	}...)
}
