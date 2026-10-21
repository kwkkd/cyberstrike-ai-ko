package multiagent

import (
	"context"
	"testing"

	"github.com/cloudwego/eino/adk"
	"github.com/cloudwego/eino/adk/prebuilt/supervisor"
	"github.com/cloudwego/eino/schema"
)

type fakeAgenticMessageAgent struct {
	name        string
	description string
	captured    *adk.TypedAgentInput[*schema.AgenticMessage]
	resumeInfo  *adk.ResumeInfo
	events      []*adk.TypedAgentEvent[*schema.AgenticMessage]
}

func (f *fakeAgenticMessageAgent) Name(context.Context) string {
	return f.name
}

func (f *fakeAgenticMessageAgent) Description(context.Context) string {
	return f.description
}

func (f *fakeAgenticMessageAgent) Run(_ context.Context, input *adk.TypedAgentInput[*schema.AgenticMessage], _ ...adk.AgentRunOption) *adk.AsyncIterator[*adk.TypedAgentEvent[*schema.AgenticMessage]] {
	f.captured = input
	iter, gen := adk.NewAsyncIteratorPair[*adk.TypedAgentEvent[*schema.AgenticMessage]]()
	go func() {
		defer gen.Close()
		for _, ev := range f.events {
			gen.Send(ev)
		}
	}()
	return iter
}

func (f *fakeAgenticMessageAgent) Resume(_ context.Context, info *adk.ResumeInfo, _ ...adk.AgentRunOption) *adk.AsyncIterator[*adk.TypedAgentEvent[*schema.AgenticMessage]] {
	f.resumeInfo = info
	iter, gen := adk.NewAsyncIteratorPair[*adk.TypedAgentEvent[*schema.AgenticMessage]]()
	go func() {
		defer gen.Close()
		for _, ev := range f.events {
			gen.Send(ev)
		}
	}()
	return iter
}

func TestEinoAgenticMessageAgentAdapterConvertsInputAndEvents(t *testing.T) {
	inner := &fakeAgenticMessageAgent{
		name:        "agentic",
		description: "typed agent",
		events: []*adk.TypedAgentEvent[*schema.AgenticMessage]{
			{
				AgentName: "agentic",
				Output: &adk.TypedAgentOutput[*schema.AgenticMessage]{
					MessageOutput: &adk.TypedMessageVariant[*schema.AgenticMessage]{
						Message: &schema.AgenticMessage{
							Role: schema.AgenticRoleTypeAssistant,
							ContentBlocks: []*schema.ContentBlock{
								schema.NewContentBlock(&schema.AssistantGenText{Text: "hello"}),
							},
						},
					},
				},
			},
		},
	}
	agent := newEinoAgenticMessageAgentAdapter(inner)

	if agent.Name(context.Background()) != "agentic" || agent.Description(context.Background()) != "typed agent" {
		t.Fatalf("adapter metadata name=%q desc=%q", agent.Name(context.Background()), agent.Description(context.Background()))
	}
	iter := agent.Run(context.Background(), &adk.AgentInput{
		EnableStreaming: true,
		Messages: []*schema.Message{
			schema.UserMessage("hi"),
		},
	})

	ev, ok := iter.Next()
	if !ok {
		t.Fatal("expected adapted event")
	}
	if inner.captured == nil || !inner.captured.EnableStreaming || len(inner.captured.Messages) != 1 {
		t.Fatalf("captured input = %#v", inner.captured)
	}
	if inner.captured.Messages[0].Role != schema.AgenticRoleTypeUser || inner.captured.Messages[0].ContentBlocks[0].UserInputText.Text != "hi" {
		t.Fatalf("captured message = %#v", inner.captured.Messages[0])
	}
	if ev.AgentName != "agentic" || ev.Output == nil || ev.Output.MessageOutput == nil {
		t.Fatalf("event = %#v", ev)
	}
	if ev.Output.MessageOutput.Role != schema.Assistant || ev.Output.MessageOutput.Message.Content != "hello" {
		t.Fatalf("message output = %#v", ev.Output.MessageOutput)
	}
	if _, ok := iter.Next(); ok {
		t.Fatal("expected iterator to close")
	}
}

func TestEinoAgenticMessageAgentAdapterNilInnerReturnsNil(t *testing.T) {
	if got := newEinoAgenticMessageAgentAdapter(nil); got != nil {
		t.Fatalf("adapter = %#v, want nil", got)
	}
}

type fakeSubAgentSetter struct {
	*fakeAgenticMessageAgent
	subAgents []adk.TypedAgent[*schema.AgenticMessage]
}

func (f *fakeSubAgentSetter) OnSetSubAgents(_ context.Context, subAgents []adk.TypedAgent[*schema.AgenticMessage]) error {
	f.subAgents = subAgents
	return nil
}

func (f *fakeSubAgentSetter) OnSetAsSubAgent(context.Context, adk.TypedAgent[*schema.AgenticMessage]) error {
	return nil
}

func (f *fakeSubAgentSetter) OnDisallowTransferToParent(context.Context) error {
	return nil
}

func TestEinoAgenticMessageAgentAdapterRegistersSubAgents(t *testing.T) {
	supervisorInner := &fakeSubAgentSetter{fakeAgenticMessageAgent: &fakeAgenticMessageAgent{name: "supervisor"}}
	worker := &fakeAgenticMessageAgent{name: "worker"}

	adapter := newEinoAgenticMessageAgentAdapter(supervisorInner, worker)
	root, err := supervisor.New(context.Background(), &supervisor.Config{
		Supervisor: adapter,
		SubAgents: []adk.Agent{
			newEinoAgenticMessageAgentAdapter(worker),
		},
	})
	if err != nil {
		t.Fatalf("supervisor.New: %v", err)
	}
	if root == nil {
		t.Fatal("supervisor.New returned nil agent")
	}
	if len(supervisorInner.subAgents) != 1 {
		t.Fatalf("registered sub-agents = %d, want 1", len(supervisorInner.subAgents))
	}
	if got := supervisorInner.subAgents[0].Name(context.Background()); got != "worker" {
		t.Fatalf("registered sub-agent name = %q, want worker", got)
	}
}

func TestEinoAgenticMessageAgentAdapterRejectsSubAgentMismatch(t *testing.T) {
	supervisorInner := &fakeSubAgentSetter{fakeAgenticMessageAgent: &fakeAgenticMessageAgent{name: "supervisor"}}
	adapter := newEinoAgenticMessageAgentAdapter(supervisorInner, &fakeAgenticMessageAgent{name: "worker"})

	err := adapter.(adk.OnSubAgents).OnSetSubAgents(context.Background(), []adk.Agent{
		newEinoAgenticMessageAgentAdapter(&fakeAgenticMessageAgent{name: "unexpected"}),
	})
	if err == nil {
		t.Fatal("expected an error for an unknown sub-agent")
	}
}

func TestEinoAgenticMessageAgentAdapterResumeConvertsEvents(t *testing.T) {
	inner := &fakeAgenticMessageAgent{
		name: "agentic",
		events: []*adk.TypedAgentEvent[*schema.AgenticMessage]{
			{
				AgentName: "agentic",
				Output: &adk.TypedAgentOutput[*schema.AgenticMessage]{
					MessageOutput: &adk.TypedMessageVariant[*schema.AgenticMessage]{
						Message: &schema.AgenticMessage{
							Role: schema.AgenticRoleTypeAssistant,
							ContentBlocks: []*schema.ContentBlock{
								schema.NewContentBlock(&schema.AssistantGenText{Text: "resumed"}),
							},
						},
					},
				},
			},
		},
	}
	agent, ok := newEinoAgenticMessageAgentAdapter(inner).(adk.ResumableAgent)
	if !ok {
		t.Fatal("adapter must implement adk.ResumableAgent")
	}
	info := &adk.ResumeInfo{WasInterrupted: true}
	iter := agent.Resume(context.Background(), info)
	ev, ok := iter.Next()
	if !ok {
		t.Fatal("expected adapted resume event")
	}
	if inner.resumeInfo != info {
		t.Fatalf("resume info = %#v, want original pointer", inner.resumeInfo)
	}
	if ev.Output == nil || ev.Output.MessageOutput == nil || ev.Output.MessageOutput.Message.Content != "resumed" {
		t.Fatalf("resume event = %#v", ev)
	}
}
