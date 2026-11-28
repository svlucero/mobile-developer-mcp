package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/svlucero/mobile-developer-mcp/internal/mobile"
)

var version = "dev"

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	server := mobile.NewServer(mobile.NewService(mobile.Options{}), version)
	if err := server.Run(ctx, &mcp.StdioTransport{}); err != nil && ctx.Err() == nil {
		// stdout belongs exclusively to the MCP protocol.
		fmt.Fprintln(os.Stderr, "mobile-developer-mcp stopped unexpectedly")
	}
}
