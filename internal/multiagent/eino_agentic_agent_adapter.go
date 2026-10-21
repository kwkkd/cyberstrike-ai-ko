package multiagent

import (
	"context"
	"fmt"

	"github.com/cloudwego/eino/adk"
	"github.com/cloudwego/eino/schema"
)

type einoAgenticMessageAgentAdapter struct {
	inner adk.TypedAgent[*schema.AgenticMessage]

	// typedSubAgents carries the agentic sub-agents that correspond to the
	// adk.Agent values registered through Eino's OnSubAgents interface. Eino's
	// supervisor wraps each sub-agent before calling OnSetSubAgents, so the
	// original typed agents cannot be recovered from that list. Keeping them
	// here lets the adapter forward registration to the typed inner agent,
	// which is what makes transfer_to_agent available to the supervisor.
	typedSubAgents []adk.TypedAgent[*schema.AgenticMessage]
}

func newEinoAgenticMessageAgentAdapter(inner adk.TypedAgent[*schema.AgenticMessage], typedSubAgents ...adk.TypedAgent[*schema.AgenticMessage]) adk.Agent {
	if inner == nil {
		return nil
	}
	subs := make([]adk.TypedAgent[*schema.AgenticMessage], 0, len(typedSubAgents))
	for _, sub := range typedSubAgents {
		if sub != nil {
			subs = append(subs, sub)
		}
	}
	return &einoAgenticMessageAgentAdapter{inner: inner, typedSubAgents: subs}
}

type agenticSubAgentSetter interface {
	OnSetSubAgents(ctx context.Context, subAgents []adk.TypedAgent[*schema.AgenticMessage]) error
	OnSetAsSubAgent(ctx context.Context, parent adk.TypedAgent[*schema.AgenticMessage]) error
	OnDisallowTransferToParent(ctx context.Context) error
}

// OnSetSubAgents implements adk.OnSubAgents. Eino's supervisor calls this
// through a type assertion; without it the sub-agent list is silently dropped
// and the supervisor never gets a transfer_to_agent tool.
func (a *einoAgenticMessageAgentAdapter) OnSetSubAgents(ctx context.Context, subAgents []adk.Agent) error {
	if a == nil || a.inner == nil {
		return fmt.Errorf("agentic adapter: inner agent is nil")
	}
	if len(a.typedSubAgents) == 0 {
		return fmt.Errorf("agentic adapter: no typed sub-agents were configured")
	}
	if len(subAgents) != len(a.typedSubAgents) {
		return fmt.Errorf("agentic adapter: sub-agent count mismatch: got %d, want %d", len(subAgents), len(a.typedSubAgents))
	}

	byName := make(map[string]adk.TypedAgent[*schema.AgenticMessage], len(a.typedSubAgents))
	for _, sub := range a.typedSubAgents {
		name := sub.Name(ctx)
		if name == "" {
			return fmt.Errorf("agentic adapter: typed sub-agent has an empty name")
		}
		if _, exists := byName[name]; exists {
			return fmt.Errorf("agentic adapter: duplicate typed sub-agent name %q", name)
		}
		byName[name] = sub
	}

	ordered := make([]adk.TypedAgent[*schema.AgenticMessage], 0, len(subAgents))
	for _, sub := range subAgents {
		if sub == nil {
			return fmt.Errorf("agentic adapter: nil sub-agent")
		}
		name := sub.Name(ctx)
		typed, ok := byName[name]
		if !ok {
			return fmt.Errorf("agentic adapter: unknown sub-agent %q", name)
		}
		delete(byName, name)
		ordered = append(ordered, typed)
	}
	if len(byName) != 0 {
		return fmt.Errorf("agentic adapter: %d typed sub-agent(s) were not registered by Eino", len(byName))
	}

	setter, ok := a.inner.(agenticSubAgentSetter)
	if !ok {
		return fmt.Errorf("agentic adapter: inner agent does not support sub-agent registration")
	}
	return setter.OnSetSubAgents(ctx, ordered)
}

// OnSetAsSubAgent is part of adk.OnSubAgents. Supervisor sub-agents are
// wrapped by Eino's deterministic transfer helper, which appends the transfer
// event to the parent stream; there is no additional parent tool to install.
func (a *einoAgenticMessageAgentAdapter) OnSetAsSubAgent(context.Context, adk.Agent) error {
	return nil
}

func (a *einoAgenticMessageAgentAdapter) OnDisallowTransferToParent(context.Context) error {
	return nil
}

func (a *einoAgenticMessageAgentAdapter) Name(ctx context.Context) string {
	if a == nil || a.inner == nil {
		return ""
	}
	return a.inner.Name(ctx)
}

func (a *einoAgenticMessageAgentAdapter) Description(ctx context.Context) string {
	if a == nil || a.inner == nil {
		return ""
	}
	return a.inner.Description(ctx)
}

func (a *einoAgenticMessageAgentAdapter) Run(ctx context.Context, input *adk.AgentInput, opts ...adk.AgentRunOption) *adk.AsyncIterator[*adk.AgentEvent] {
	return a.runTyped(ctx, input, nil, opts...)
}

func (a *einoAgenticMessageAgentAdapter) Resume(ctx context.Context, info *adk.ResumeInfo, opts ...adk.AgentRunOption) *adk.AsyncIterator[*adk.AgentEvent] {
	return a.runTyped(ctx, nil, info, opts...)
}

func (a *einoAgenticMessageAgentAdapter) runTyped(ctx context.Context, input *adk.AgentInput, resumeInfo *adk.ResumeInfo, opts ...adk.AgentRunOption) *adk.AsyncIterator[*adk.AgentEvent] {
	iter, gen := adk.NewAsyncIteratorPair[*adk.AgentEvent]()
	go func() {
		defer gen.Close()
		if a == nil || a.inner == nil {
			gen.Send(&adk.AgentEvent{Err: fmt.Errorf("agentic adapter: inner agent is nil")})
			return
		}
		var agenticIter *adk.AsyncIterator[*adk.TypedAgentEvent[*schema.AgenticMessage]]
		if resumeInfo != nil {
			resumable, ok := a.inner.(adk.TypedResumableAgent[*schema.AgenticMessage])
			if !ok {
				gen.Send(&adk.AgentEvent{Err: fmt.Errorf("agentic adapter: inner agent does not support resume")})
				return
			}
			agenticIter = resumable.Resume(ctx, resumeInfo, opts...)
		} else {
			agenticInput := &adk.TypedAgentInput[*schema.AgenticMessage]{}
			if input != nil {
				agenticInput.EnableStreaming = input.EnableStreaming
				agenticInput.Messages = EinoMessagesToAgentic(input.Messages)
			}
			agenticIter = a.inner.Run(ctx, agenticInput, opts...)
		}
		for {
			ev, ok := agenticIter.Next()
			if !ok {
				return
			}
			for _, adapted := range adaptAgenticEventToEinoEvents(ev) {
				if adapted != nil {
					gen.Send(adapted)
				}
			}
		}
	}()
	return iter
}
