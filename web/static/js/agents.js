// 多代理子 Agent Markdown（agents/*.md）管理
function _agentsT(key, opts) {
    return typeof window.t === 'function' ? window.t(key, opts) : key;
}

let markdownAgentsEditingFilename = null;
let markdownAgentsEditingIsOrchestrator = false;
let agentInstructionEditorOpen = false;

function setAgentInstructionEditorState(visible, showToggle) {
    agentInstructionEditorOpen = !!visible;
    const ta = document.getElementById('agent-md-instruction');
    const notice = document.getElementById('agent-md-instruction-notice');
    const btn = document.getElementById('agent-md-instruction-toggle');
    if (ta) ta.style.display = visible ? '' : 'none';
    if (notice) notice.style.display = visible ? 'none' : 'block';
    if (btn) {
        btn.style.display = showToggle ? '' : 'none';
        btn.textContent = visible ? _agentsT('agentsPage.hideSourceEditor') : _agentsT('agentsPage.showSourceEditor');
    }
}

function toggleAgentInstructionEditor() {
    setAgentInstructionEditorState(!agentInstructionEditorOpen, true);
}

// Built-in agent definitions ship with Chinese frontmatter. Keep IDs and
// filenames untouched, but show Korean names/descriptions in the UI.
const AGENT_PRESET_KO = {
    '攻击面枚举专员': {
        name: '공격 표면 열거 전문가',
        description: '정찰/정보 입력을 바탕으로 서비스, 기술 스택, 의존성, 잠재적 진입점을 정리하고 구조화된 공격 표면 맵과 검증 우선순위를 출력하며, 메인 에이전트에 완전한 목표와 범위를 요구합니다.'
    },
    '清理与回滚专员': {
        name: '정리 및 롤백 전문가',
        description: '승인된 테스트를 위한 정리/롤백 검증 체크리스트를 설계하여 최소 잔여물과 감사 가능성·재현 가능성을 보장하고, 메인 에이전트에 완전한 목표와 변경 컨텍스트를 요구합니다.'
    },
    '参与规划专员': {
        name: '참여 계획 전문가',
        description: '참여 범위, ROE, 성공 기준을 정의하고 반복적 테스트 청사진과 증거 체크리스트를 산출하며(침입 실행 아님), 메인 에이전트에 완전한 목표와 제약 정보를 요구합니다.'
    },
    '影响与数据外泄证明专员': {
        name: '영향 및 데이터 유출 증명 전문가',
        description: '최소 영향 방식으로 “비즈니스 영향/데이터 접근성” 증명 방안을 설계하고, 데이터 마스킹·노출 최소화·롤백을 강조하며, 메인 에이전트에 완전한 목표와 범위를 요구합니다.'
    },
    '信息收集专员': {
        name: '정보 수집 전문가',
        description: '공개 정보, 자산 지문, 유출 단서, 디렉터리 및 인터페이스 발견, 제3자 노출면 정리를 수행하며, 승인 범위 내 대규모 정보 수집에 적합하고 메인 에이전트에 완전한 목표와 범위를 요구합니다.'
    },
    '内网横向专员': {
        name: '내부 네트워크 측면 이동 전문가',
        description: '초기 거점 확보 후 내부 발견, 자격 증명 및 세션 활용, 측면 이동과 권한 유지 방안(승인된 훈련/침투 환경만)을 다루며, 메인 에이전트에 완전한 목표와 네트워크 범위를 요구합니다.'
    },
    '运维安全与干扰最小化专员': {
        name: '운영 보안 및 간섭 최소화 전문가',
        description: '테스트 노이즈, 관측 가능성, 블루팀 경보, 롤백 위험 관점에서 “저간섭 검증 전략”과 증거 수집 방식을 설계하며(우회 수단은 제공하지 않음), 메인 에이전트에 완전한 목표와 범위를 요구합니다.'
    },
    'Plan-Execute 规划主代理': {
        name: 'Plan-Execute 계획 메인 에이전트',
        description: 'plan_execute 모드의 계획/재계획 담당 메인 에이전트: 목표를 분해하고 계획을 수정하며, 실행기가 MCP 도구를 호출해 수행(Deep의 task 하위 에이전트는 사용하지 않음). 계획의 각 단계에는 완전한 목표와 범위가 포함되어야 하며, 실행기가 추측으로 URL/IP를 채우도록 해서는 안 됩니다.'
    },
    'Supervisor 监督主代理': {
        name: 'Supervisor 감독 메인 에이전트',
        description: 'supervisor 모드의 조정자: transfer로 전문 하위 에이전트를 위임하고 필요 시 직접 MCP를 사용하며, 목표 완료 시 exit로 종료(런타임이 전문가 목록과 exit 설명을 추가). transfer 전에 완전한 목표와 범위를 제공해야 합니다.'
    },
    '协调主代理': {
        name: '조정 메인 에이전트',
        description: '다중 에이전트 모드의 Deep 오케스트레이터: 승인된 보안 시나리오에서 MCP 도구 및 task 하위 에이전트와 협력하여 계획, 위임, 요약, 사용자 전달을 담당하며, 작업 배정 전에 하위 에이전트에 완전한 목표와 범위를 제공해야 합니다.'
    },
    '渗透测试专员': {
        name: '침투 테스트 전문가',
        description: '승인 범위 내 취약점 검증, 공격 체인 구성, 권한 상승 및 영향 증명을 수행하며, 정찰/정보 입력 후 심층 활용과 재현을 수행하고 메인 에이전트에 완전한 목표와 범위를 요구합니다.'
    },
    '持久化与后续通道专员': {
        name: '지속성 및 후속 채널 전문가',
        description: '승인된 환경에서 지속성/접근 유지 방안, 위험 균형, 롤백 검증을 평가하고 최소 영향 방식으로 실행 가능성을 증명하며, 메인 에이전트에 완전한 목표와 경계를 요구합니다.'
    },
    '权限提升专员': {
        name: '권한 상승 전문가',
        description: '초기 접근/제한된 권한을 얻은 상태에서 권한 상승 가능성, 증거 요구 사항, 안전한 검증 방법(승인된 환경만)을 평가하고, 메인 에이전트에 완전한 목표와 현재 권한 컨텍스트를 요구합니다.'
    },
    '侦察专员': {
        name: '정찰 전문가',
        description: '정보 수집, 자산 매핑, 초기 공격 표면 분석을 담당하며, 메인 에이전트가 위임 시 완전한 목표(URL/IP:Port/도메인+경로)와 범위를 제공하도록 요구합니다.'
    },
    '报告撰写与修复建议专员': {
        name: '보고서 작성 및 수정 권고 전문가',
        description: '수집된 증거를 납품 가능한 보고서 구조로 요약하고, 수정 권고와 회귀 검증 포인트를 제시하며, 메인 에이전트에 완전한 목표와 증거 컨텍스트를 요구합니다.'
    },
    '漏洞分诊专员': {
        name: '취약점 분류 전문가',
        description: '공격 표면과 증거 단서를 바탕으로 취약점 후보를 선별·우선순위화하고 “검증 경로”를 설계하며(증거 중심, 직접 무기화하지 않음), 메인 에이전트에 완전한 목표와 입력 증거를 요구합니다.'
    }
};

function agentUsesKorean() {
    return typeof window.uiLocale === 'function' && window.uiLocale() === 'ko-KR';
}

function agentDisplayName(value) {
    if (!agentUsesKorean()) return value || '';
    const preset = AGENT_PRESET_KO[value];
    return preset ? preset.name : (value || '');
}

function agentDisplayDescription(name, value) {
    if (!agentUsesKorean()) return value || '';
    const preset = AGENT_PRESET_KO[name];
    return preset ? preset.description : (value || '');
}

function bindAgentsMdListDelegation() {
    const listEl = document.getElementById('agents-md-list');
    if (!listEl || listEl.dataset.agentsClickBound === '1') return;
    listEl.dataset.agentsClickBound = '1';
    listEl.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        var editBtn = t.closest('[data-action="edit-agent-md"]');
        var delBtn = t.closest('[data-action="delete-agent-md"]');
        if (editBtn) {
            var f = editBtn.getAttribute('data-agent-file');
            if (f) {
                try { editMarkdownAgent(decodeURIComponent(f)); } catch (err) { console.warn(err); }
            }
            return;
        }
        if (delBtn) {
            var f2 = delBtn.getAttribute('data-agent-file');
            if (f2) {
                try { deleteMarkdownAgent(decodeURIComponent(f2)); } catch (err2) { console.warn(err2); }
            }
        }
    });
}

async function loadMarkdownAgents() {
    const listEl = document.getElementById('agents-md-list');
    const dirEl = document.getElementById('agents-md-dir');
    if (!listEl) return;
    bindAgentsMdListDelegation();
    listEl.innerHTML = '<div class="loading-spinner">' + _agentsT('agentsPage.loading') + '</div>';
    try {
        const r = await apiFetch('/api/multi-agent/markdown-agents');
        const data = await r.json();
        if (!r.ok) {
            throw new Error(data.error || r.statusText);
        }
        if (dirEl) {
            const d = data.dir || '';
            dirEl.textContent = d ? (_agentsT('agentsPage.dirLabel') + ': ' + d) : '';
        }
        const agents = data.agents || [];
        if (agents.length === 0) {
            listEl.innerHTML = '<div class="empty-state">' + _agentsT('agentsPage.empty') + '</div>';
            return;
        }
        agents.sort(function (x, y) {
            var ox = x.is_orchestrator ? 1 : 0;
            var oy = y.is_orchestrator ? 1 : 0;
            return oy - ox;
        });
        listEl.innerHTML = agents.map(function (a) {
            const rawFn = a.filename || '';
            const fn = escapeHtml(rawFn);
            const id = escapeHtml(a.id || '');
            const name = escapeHtml(agentDisplayName(a.name));
            const desc = escapeHtml(agentDisplayDescription(a.name, a.description) || _agentsT('agentsPage.noDesc'));
            const orch = !!a.is_orchestrator;
            const badgeLabel = orch ? _agentsT('agentsPage.badgeOrchestrator') : _agentsT('agentsPage.badgeSub');
            const badgeClass = orch ? 'agent-role-badge agent-role-badge--orchestrator' : 'agent-role-badge agent-role-badge--sub';
            return (
                '<div class="skill-card">' +
                '<div class="skill-card-header">' +
                '<h3 class="skill-card-title">' + name + '<span class="' + badgeClass + '">' + escapeHtml(badgeLabel) + '</span></h3>' +
                '<div class="skill-card-description"><code>' + fn + '</code> · id: <code>' + id + '</code><br>' + desc + '</div>' +
                '</div>' +
                '<div class="skill-card-actions">' +
                '<button type="button" class="btn-secondary btn-small" data-action="edit-agent-md" data-agent-file="' + encodeURIComponent(rawFn) + '">' + escapeHtml(_agentsT('common.edit')) + '</button>' +
                '<button type="button" class="btn-secondary btn-small btn-danger" data-action="delete-agent-md" data-agent-file="' + encodeURIComponent(rawFn) + '">' + escapeHtml(_agentsT('common.delete')) + '</button>' +
                '</div></div>'
            );
        }).join('');
    } catch (e) {
        console.error(e);
        listEl.innerHTML = '<div class="empty-state">' + escapeHtml(e.message || String(e)) + '</div>';
        showNotification(_agentsT('agentsPage.loadFailed') + ': ' + e.message, 'error');
    }
}

function showAddMarkdownAgentModal() {
    if (typeof requirePermission === 'function' && !requirePermission('agents:write')) return;
    markdownAgentsEditingFilename = null;
    markdownAgentsEditingIsOrchestrator = false;
    const modal = document.getElementById('agent-md-modal');
    const title = document.getElementById('agent-md-modal-title');
    const row = document.getElementById('agent-md-filename-row');
    if (title) title.textContent = _agentsT('agentsPage.createTitle');
    if (row) row.style.display = '';
    document.getElementById('agent-md-filename-current').value = '';
    document.getElementById('agent-md-filename').value = '';
    document.getElementById('agent-md-filename').disabled = false;
    var roleEl = document.getElementById('agent-md-role');
    if (roleEl) roleEl.value = 'sub';
    document.getElementById('agent-md-id').value = '';
    document.getElementById('agent-md-name').value = '';
    document.getElementById('agent-md-description').value = '';
    delete document.getElementById('agent-md-name').dataset.original;
    delete document.getElementById('agent-md-name').dataset.display;
    delete document.getElementById('agent-md-description').dataset.original;
    delete document.getElementById('agent-md-description').dataset.display;
    document.getElementById('agent-md-tools').value = '';
    document.getElementById('agent-md-bind-role').value = '';
    document.getElementById('agent-md-max-iter').value = '0';
    document.getElementById('agent-md-instruction').value = '';
    setAgentInstructionEditorState(true, false);
    openAppModal('agent-md-modal');
}

async function editMarkdownAgent(filename) {
    if (!filename) return;
    const title = document.getElementById('agent-md-modal-title');
    const row = document.getElementById('agent-md-filename-row');
    markdownAgentsEditingFilename = null;
    markdownAgentsEditingIsOrchestrator = false;
    if (title) title.textContent = _agentsT('agentsPage.editTitle');
    if (row) row.style.display = 'none';
    document.getElementById('agent-md-instruction').value = '';
    openAppModal('agent-md-modal', { focus: false });
    try {
        const r = await apiFetch('/api/multi-agent/markdown-agents/' + encodeURIComponent(filename));
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || r.statusText);
        markdownAgentsEditingFilename = data.filename || filename;
        markdownAgentsEditingIsOrchestrator = !!data.is_orchestrator;
        deferModalContent(function () {
            document.getElementById('agent-md-filename-current').value = data.filename || filename;
            document.getElementById('agent-md-filename').value = data.filename || filename;
            document.getElementById('agent-md-filename').disabled = true;
            var roleEl2 = document.getElementById('agent-md-role');
            if (roleEl2) roleEl2.value = data.is_orchestrator ? 'orchestrator' : 'sub';
            document.getElementById('agent-md-id').value = data.id || '';
            const nameInput = document.getElementById('agent-md-name');
            const descInput = document.getElementById('agent-md-description');
            const displayName = agentDisplayName(data.name) || '';
            const displayDesc = agentDisplayDescription(data.name, data.description) || '';
            nameInput.value = displayName;
            nameInput.dataset.original = data.name || '';
            nameInput.dataset.display = displayName;
            descInput.value = displayDesc;
            descInput.dataset.original = data.description || '';
            descInput.dataset.display = displayDesc;
            document.getElementById('agent-md-tools').value = Array.isArray(data.tools) ? data.tools.join(', ') : '';
            document.getElementById('agent-md-bind-role').value = data.bind_role || '';
            document.getElementById('agent-md-max-iter').value = String(data.max_iterations != null ? data.max_iterations : 0);
            document.getElementById('agent-md-instruction').value = data.instruction || '';
            setAgentInstructionEditorState(false, true);
            document.getElementById('agent-md-name')?.focus();
        });
    } catch (e) {
        closeMarkdownAgentModal();
        showNotification(_agentsT('agentsPage.loadOneFailed') + ': ' + e.message, 'error');
    }
}

function closeMarkdownAgentModal() {
    closeAppModal('agent-md-modal');
    markdownAgentsEditingFilename = null;
    markdownAgentsEditingIsOrchestrator = false;
    setAgentInstructionEditorState(true, false);
}

function parseToolsInput(s) {
    if (!s || !String(s).trim()) return [];
    return String(s).split(/[,;|]/).map(function (x) { return x.trim(); }).filter(Boolean);
}

async function saveMarkdownAgent() {
    if (typeof requirePermission === 'function' && !requirePermission('agents:write')) return;
    const nameInput = document.getElementById('agent-md-name');
    const descriptionInput = document.getElementById('agent-md-description');
    let name = nameInput.value.trim();
    if (nameInput.dataset.display !== undefined &&
        name === String(nameInput.dataset.display || '').trim()) {
        name = nameInput.dataset.original || name;
    }
    if (!name) {
        showNotification(_agentsT('agentsPage.nameRequired'), 'error');
        return;
    }
    let agentDescription = descriptionInput.value.trim();
    if (descriptionInput.dataset.display !== undefined &&
        agentDescription === String(descriptionInput.dataset.display || '').trim()) {
        agentDescription = descriptionInput.dataset.original || '';
    }
    const roleSel = document.getElementById('agent-md-role');
    const roleVal = roleSel ? roleSel.value : 'sub';
    const fnDraft = (document.getElementById('agent-md-filename') && document.getElementById('agent-md-filename').value.trim().toLowerCase()) || '';
    const isOrchestratorAgent = markdownAgentsEditingIsOrchestrator ||
        roleVal === 'orchestrator' ||
        fnDraft === 'orchestrator.md';
    const instruction = document.getElementById('agent-md-instruction').value.trim();
    if (!isOrchestratorAgent && !instruction) {
        showNotification(_agentsT('agentsPage.instructionRequired'), 'error');
        return;
    }
    const body = {
        id: document.getElementById('agent-md-id').value.trim(),
        name: name,
        description: agentDescription,
        tools: parseToolsInput(document.getElementById('agent-md-tools').value),
        instruction: instruction,
        bind_role: document.getElementById('agent-md-bind-role').value.trim(),
        max_iterations: parseInt(document.getElementById('agent-md-max-iter').value, 10) || 0,
        kind: roleVal === 'orchestrator' ? 'orchestrator' : ''
    };
    const isEdit = !!markdownAgentsEditingFilename;
    let url;
    let method;
    if (isEdit) {
        url = '/api/multi-agent/markdown-agents/' + encodeURIComponent(markdownAgentsEditingFilename);
        method = 'PUT';
    } else {
        url = '/api/multi-agent/markdown-agents';
        method = 'POST';
        const fn = document.getElementById('agent-md-filename').value.trim();
        if (fn && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.md$/.test(fn)) {
            showNotification(_agentsT('agentsPage.filenameInvalid'), 'error');
            return;
        }
        body.filename = fn;
    }
    try {
        const r = await apiFetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await r.json().catch(function () { return {}; });
        if (!r.ok) throw new Error(data.error || r.statusText);
        showNotification(isEdit ? _agentsT('agentsPage.saveOk') : _agentsT('agentsPage.createOk'), 'success');
        closeMarkdownAgentModal();
        await loadMarkdownAgents();
    } catch (e) {
        showNotification(_agentsT('agentsPage.saveFailed') + ': ' + e.message, 'error');
    }
}

async function deleteMarkdownAgent(filename) {
    if (!filename) return;
    if (!confirm(_agentsT('agentsPage.deleteConfirm', { name: filename }))) return;
    try {
        const r = await apiFetch('/api/multi-agent/markdown-agents/' + encodeURIComponent(filename), { method: 'DELETE' });
        const data = await r.json().catch(function () { return {}; });
        if (!r.ok) throw new Error(data.error || r.statusText);
        showNotification(_agentsT('agentsPage.deleteOk'), 'success');
        await loadMarkdownAgents();
    } catch (e) {
        showNotification(_agentsT('agentsPage.deleteFailed') + ': ' + e.message, 'error');
    }
}

document.addEventListener('languagechange', function () {
    const page = document.getElementById('page-agents-management');
    if (page && page.classList.contains('active')) {
        loadMarkdownAgents().catch(function () { /* ignore */ });
    }
});
