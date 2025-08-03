package integration

import (
	"testing"

	"github.com/ktock/container2wasm/tests/integration/utils"
)

func TestBrowsers(t *testing.T) {
	utils.RunTestRuntimes(t, []utils.TestSpec{
		{
			Name:    "browser-hello",
			Runtime: "run_browser.py",
			RuntimeEnv: [][]string{
				{"TARGET_BROWSER=chrome"},
				{"TARGET_BROWSER=firefox"},
				{"TARGET_BROWSER=edge"},
			},
			Inputs: []utils.Input{
				{Image: "alpine:3.17", Architecture: utils.X8664},
				{Image: "alpine:3.17", ConvertOpts: []string{"--target-arch=aarch64"}, Architecture: utils.AArch64},
				{Image: "riscv64/alpine:20221110", ConvertOpts: []string{"--target-arch=riscv64"}, Architecture: utils.RISCV64},
			},
			ToJS:           true,
			KillRuntime:    true,
			IgnoreExitCode: true,
			NoParallel:     true,
			Want:           utils.WantPromptWithoutExit("/ # ", [2]string{"echo -n hello\n", "hello"}),
		},
		{
			Name:    "browser-nw-fetch",
			Runtime: "run_browser.py",
			RuntimeEnv: [][]string{
				{"TARGET_BROWSER=chrome"},
				{"TARGET_BROWSER=firefox"},
				{"TARGET_BROWSER=edge"},
			},
			Inputs: []utils.Input{
				{Image: "alpine:3.17", Architecture: utils.X8664},
				{Image: "alpine:3.17", ConvertOpts: []string{"--target-arch=aarch64"}, Architecture: utils.AArch64},
				{Image: "riscv64/alpine:20221110", ConvertOpts: []string{"--target-arch=riscv64"}, Architecture: utils.RISCV64},
			},
			RuntimeOpts:    utils.StringFlags("?net=browser"),
			ToJS:           true,
			KillRuntime:    true,
			IgnoreExitCode: true,
			NoParallel:     true,
			Want:           utils.ContainsPromptWithoutExit("/ # ", [2]string{"wget -S -O - https://testpage/\n", "HTTP/1.1 200 OK"}),
		},
		{
			Name:    "browser-nw-ws",
			Runtime: "run_browser.py",
			RuntimeEnv: [][]string{
				{"TARGET_BROWSER=chrome"},
				{"TARGET_BROWSER=firefox"},
				{"TARGET_BROWSER=edge"},
			},
			Inputs: []utils.Input{
				{Image: "alpine:3.17", Architecture: utils.X8664},
				{Image: "alpine:3.17", ConvertOpts: []string{"--target-arch=aarch64"}, Architecture: utils.AArch64},
				{Image: "riscv64/alpine:20221110", ConvertOpts: []string{"--target-arch=riscv64"}, Architecture: utils.RISCV64},
			},
			RuntimeOpts:    utils.StringFlags("?net=delegate=wss://testpage:8888"),
			ToJS:           true,
			KillRuntime:    true,
			IgnoreExitCode: true,
			NoParallel:     true,
			Want:           utils.ContainsPromptWithoutExit("/ # ", [2]string{"wget -S -O - http://testpage/\n", "HTTP/1.1 200 OK"}),
		},
	}...)
}
