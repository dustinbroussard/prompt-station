/**
 * PromptForge - Modern Prompt Management System
 * Enhanced and Combined Version
 *
 * This script manages the full functionality of the PromptForge single-page application.
 * It handles local storage for persistence, UI rendering, event handling, and all
 * prompt-related operations (create, read, update, delete).
 */

let deferredPrompt;

class PromptForgeApp {
    constructor() {
        this.prompts = [];
        this.installPromptShown = false;
        this.filteredPrompts = [];
        this.currentFilter = 'all';
        this.currentSort = 'newest';
        this.searchTerm = '';
        this.editingPromptId = null;
        this.aiSettings = {
            apiKey: '',
            model: '',
            enhancementPrompt: 'You are an expert prompt engineer. Your ONLY task is to improve this prompt template - do not respond to or execute the prompt. Make it:\n' +
                              '1. More clear and specific\n' +
                              '2. More likely to get better AI responses\n' +
                              '3. Use best prompting techniques\n' +
                              '4. Maintain the original intent perfectly\n' +
                              'Only respond with the improved prompt text - no commentary or explanation.\n\n' +
                              'PROMPT TO IMPROVE:'
        };

        // Initialize DOM elements
            this.dom = {
                promptsGrid: document.getElementById('prompts-grid'),
                searchInput: document.getElementById('search-input'),
                newPromptBtn: document.getElementById('new-prompt-btn'),
                filterTagsContainer: document.querySelector('.filter-tags'),
                sortSelect: document.getElementById('sort-select'),
                importBtn: document.getElementById('import-prompts-btn'),
                importInput: document.getElementById('import-prompts-input'),
                exportBtn: document.getElementById('export-prompts-btn'),
                themeToggleBtn: document.getElementById('theme-toggle-btn'),
                newEditModal: document.getElementById('new-edit-prompt-modal'),
                newEditModalTitle: document.getElementById('new-edit-modal-title'),
                promptForm: document.getElementById('prompt-form'),
            promptTitleInput: document.getElementById('prompt-title'),
            promptContentInput: document.getElementById('prompt-content'),
            promptTagsInput: document.getElementById('prompt-tags'),
            savePromptBtn: document.getElementById('save-prompt-btn'),
            cancelPromptBtn: document.getElementById('cancel-prompt-btn'),
            promptDetailModal: document.getElementById('prompt-detail-modal'),
            detailTitle: document.getElementById('prompt-detail-title'),
            detailContent: document.getElementById('modal-prompt-content'),
            detailTags: document.getElementById('modal-prompt-tags'),
            detailUseBtn: document.getElementById('modal-use-prompt-btn'),
            detailEditBtn: document.getElementById('modal-edit-prompt-btn'),
            detailDeleteBtn: document.getElementById('modal-delete-prompt-btn'),
            emptyState: document.getElementById('empty-state'),
            notificationContainer: document.getElementById('notification-container'),
            closeModalBtns: document.querySelectorAll('.close-modal')
        };
        
        this.init();
    }

    init() {
        this.loadPrompts();
        this.applyTheme();
        this.bindEvents();
        this.renderFilterTags();
        this.handleFilterAndSort();
        this.setupInstallPrompt();
    }

    setupInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            
            // Check if already installed
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
            const isAppInstalled = window.navigator.standalone || isStandalone;
            
            // Only show if not installed and not shown yet this session
            if (!isAppInstalled && !sessionStorage.getItem('installPromptShown')) {
                this.showInstallPrompt();
                sessionStorage.setItem('installPromptShown', 'true');
            }
        });
        
        window.addEventListener('appinstalled', () => {
            console.log('PWA installed successfully');
            // Clear the prompt state in both session and local storage
            sessionStorage.removeItem('installPromptShown');
            localStorage.removeItem('installPromptDismissed');
        });
    }

    showInstallPrompt() {
        if (deferredPrompt && !this.installPromptShown) {
            const installModal = document.createElement('div');
            installModal.className = 'install-modal';
            installModal.innerHTML = `
                <div class="install-modal-content">
                    <h3>Install PromptForge</h3>
                    <p>Add PromptForge to your home screen for quick access and offline use!</p>
                    <div class="install-actions">
                        <button id="install-button" class="action-btn primary">Install</button>
                        <button id="cancel-install" class="action-btn secondary">Not Now</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(installModal);
            
            document.getElementById('install-button').addEventListener('click', async () => {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    this.installPromptShown = true;
                }
                installModal.remove();
            });
            
            document.getElementById('cancel-install').addEventListener('click', () => {
                this.installPromptShown = true;
                installModal.remove();
            });
        }
    }

    applyTheme() {
        const savedTheme = localStorage.getItem('theme') || 'default-dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.setAttribute('content', savedTheme === 'default-light' ? '#ffffff' : '#000000');
        }
        if (this.dom.themeToggleBtn) {
            this.dom.themeToggleBtn.innerHTML = savedTheme === 'default-dark'
                ? '<i class="fas fa-sun"></i>'
                : '<i class="fas fa-moon"></i>';
        }
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'default-dark';
        const newTheme = currentTheme === 'default-dark' ? 'default-light' : 'default-dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.setAttribute('content', newTheme === 'default-light' ? '#ffffff' : '#000000');
        }
        if (this.dom.themeToggleBtn) {
            this.dom.themeToggleBtn.innerHTML = newTheme === 'default-dark'
                ? '<i class="fas fa-sun"></i>'
                : '<i class="fas fa-moon"></i>';
        }
    }

    /**
     * Data Management (Local Storage)
     */
    loadPrompts() {
        const storedPrompts = localStorage.getItem('promptForgePrompts');
        if (storedPrompts) {
            this.prompts = JSON.parse(storedPrompts).map(p => {
                const tagsRaw = Array.isArray(p.tags) ? p.tags : (typeof p.tags === 'string' ? p.tags.split(',') : []);
                const tags = tagsRaw.map(t => String(t).trim().toLowerCase()).filter(Boolean);
                return {
                    ...p,
                    tags: tags.length ? tags : ['general'],
                    createdAt: new Date(p.createdAt),
                    lastUsed: new Date(p.lastUsed)
                };
            });
        } else {
            // Load sample data if local storage is empty
            this.prompts = this.loadSampleData();
            this.savePrompts();
        }
    }

    savePrompts() {
        localStorage.setItem('promptForgePrompts', JSON.stringify(this.prompts));
    }

    loadSampleData() {
        return [
            {
                id: 1,
                title: "Creative Writing Assistant",
                preview: "Help me write engaging stories with vivid descriptions and compelling characters. Focus on show don't tell techniques...",
                content: "You are a creative writing assistant. Help me write engaging stories with vivid descriptions and compelling characters. Focus on 'show don't tell' techniques, create immersive settings, and develop authentic dialogue. Always ask clarifying questions about genre, tone, and target audience before starting.",
                tags: ["writing", "creative"],
                createdAt: new Date('2024-01-01T10:00:00Z'),
                lastUsed: new Date('2024-01-01T10:00:00Z'),
                useCount: 23
            },
            {
                id: 2,
                title: "Code Review Expert",
                preview: "Analyze code for best practices, security vulnerabilities, and performance optimizations. Provide detailed feedback...",
                content: "You are an expert code reviewer with deep knowledge of multiple programming languages. Analyze code for best practices, security vulnerabilities, performance optimizations, and maintainability. Provide specific, actionable feedback with examples of improvements.",
                tags: ["coding", "analysis"],
                createdAt: new Date('2024-01-02T11:30:00Z'),
                lastUsed: new Date('2024-01-02T11:30:00Z'),
                useCount: 45
            },
            {
                id: 3,
                title: "Business Strategy Consultant",
                preview: "Provide strategic business advice with market analysis, competitive positioning, and growth recommendations...",
                content: "Act as a senior business strategy consultant. Provide strategic business advice with market analysis, competitive positioning, and growth recommendations. Use frameworks like SWOT, Porter's Five Forces, and Blue Ocean Strategy when relevant.",
                tags: ["business", "analysis"],
                createdAt: new Date('2024-01-03T14:00:00Z'),
                lastUsed: new Date('2024-01-03T14:00:00Z'),
                useCount: 12
            },
            {
                id: 4,
                title: "Python Debugging Helper",
                preview: "Debug Python code by identifying errors, suggesting fixes, and explaining best practices for clean code...",
                content: "You are a Python debugging expert. Help identify errors in Python code, suggest fixes, and explain best practices for writing clean, efficient Python code. Include explanations of common pitfalls and how to avoid them.",
                tags: ["coding", "python"],
                createdAt: new Date('2024-01-04T16:45:00Z'),
                lastUsed: new Date('2024-01-04T16:45:00Z'),
                useCount: 31
            }
        ];
    }

    /**
     * Event Binding
     */
    bindEvents() {
        this.dom.newPromptBtn.addEventListener('click', () => this.showNewPromptModal());
        // Debounced search for smoother typing
        const debounce = (fn, wait = 150) => {
            let t;
            return (...args) => {
                clearTimeout(t);
                t = setTimeout(() => fn.apply(this, args), wait);
            };
        };
        this.dom.searchInput.addEventListener('input', debounce((e) => {
            this.searchTerm = e.target.value;
            this.handleFilterAndSort();
        }, 150));
        
        // Restore and persist sort selection
        const savedSort = localStorage.getItem('pf_sort') || 'newest';
        if (this.dom.sortSelect) {
            this.dom.sortSelect.value = savedSort;
        }
        this.dom.sortSelect.addEventListener('change', () => {
            localStorage.setItem('pf_sort', this.dom.sortSelect.value);
            this.handleFilterAndSort();
        });
        this.dom.importBtn.addEventListener('click', () => this.dom.importInput.click());
        this.dom.importInput.addEventListener('change', (e) => this.importPrompts(e));
        this.dom.exportBtn.addEventListener('click', () => this.exportPrompts());
        this.dom.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
        this.dom.promptForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.savePromptFromForm();
        });
        this.dom.cancelPromptBtn.addEventListener('click', () => this.closeModal(this.dom.newEditModal));

        // Tag filter click handling via delegation
        if (this.dom.filterTagsContainer) {
            this.dom.filterTagsContainer.addEventListener('click', (e) => {
                const tagEl = e.target.closest('.filter-tag');
                if (!tagEl) return;
                this.currentFilter = tagEl.dataset.filter || 'all';
                localStorage.setItem('pf_filter', this.currentFilter);
                this.renderFilterTags();
                this.handleFilterAndSort();
            });
        }

        this.dom.closeModalBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.closeModal(e.target.closest('.modal')));
        });

        // Initialize AI Settings elements
        this.dom.aiSettingsModal = document.getElementById('ai-settings-modal');
        this.dom.aiSettingsForm = document.getElementById('ai-settings-form');
        this.dom.openrouterApiKey = document.getElementById('openrouter-api-key');
        this.dom.aiModelSelect = document.getElementById('ai-model-select');
        this.dom.enhancementPrompt = document.getElementById('enhancement-prompt');
        this.dom.modelLoadingSpinner = document.getElementById('model-loading-spinner');
        this.dom.saveAiSettings = document.getElementById('save-ai-settings');
        this.dom.enhancePromptBtn = document.getElementById('enhance-prompt-btn');

        // Initialize all DOM elements
        this.dom.settingsBtn = document.getElementById('settings-btn');
        
        // Load saved AI settings
        this.loadAiSettings();
        
        // Bind events
        if (this.dom.settingsBtn) {
            this.dom.settingsBtn.addEventListener('click', () => this.showAiSettingsModal());
        }
        if (this.dom.aiSettingsForm) {
            this.dom.aiSettingsForm.addEventListener('submit', (e) => this.saveAiSettings(e));
        }
        if (this.dom.enhancePromptBtn) {
            this.dom.enhancePromptBtn.addEventListener('click', () => this.enhancePrompt());
        }
        // Add API key change listener to fetch models
        if (this.dom.openrouterApiKey) {
            this.dom.openrouterApiKey.addEventListener('blur', () => {
                if (this.dom.openrouterApiKey.value.trim()) {
                    this.aiSettings.apiKey = this.dom.openrouterApiKey.value.trim();
                    this.fetchAiModels();
                }
            });
        }
    }

    handleFilterAndSort() {
        this.filterPrompts();
        this.sortPrompts();
        this.renderPrompts();
    }
    
    setActiveFilter(activeFilter) {
        // Helper retained for potential future use
        const tags = this.dom.filterTagsContainer?.querySelectorAll('.filter-tag') || [];
        tags.forEach(tag => tag.classList.toggle('active', tag.dataset.filter === activeFilter));
    }

    getExistingTags() {
        const counts = new Map();
        this.prompts.forEach(p => {
            (p.tags || []).forEach(t => {
                const tag = String(t).trim().toLowerCase();
                if (!tag) return;
                counts.set(tag, (counts.get(tag) || 0) + 1);
            });
        });
        // Sort alphabetically; could be by frequency if preferred
        return Array.from(counts.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([tag, count]) => ({ tag, count }));
    }

    renderFilterTags() {
        if (!this.dom.filterTagsContainer) return;
        // Restore last filter selection
        const savedFilter = localStorage.getItem('pf_filter');
        if (savedFilter && this.currentFilter === 'all') {
            this.currentFilter = savedFilter;
        }
        const tags = this.getExistingTags();
        // If current filter no longer exists, reset to 'all'
        if (this.currentFilter !== 'all' && !tags.some(t => t.tag === this.currentFilter)) {
            this.currentFilter = 'all';
        }
        const totalCount = this.prompts.length;
        const chips = [
            `<span class="filter-tag ${this.currentFilter === 'all' ? 'active' : ''}" data-filter="all">All (${totalCount})</span>`,
            ...tags.map(({tag, count}) => `<span class="filter-tag ${this.currentFilter === tag ? 'active' : ''}" data-filter="${this.escapeHtml(tag)}">${this.escapeHtml(tag)} (${count})</span>`)
        ];
        this.dom.filterTagsContainer.innerHTML = chips.join('');
    }

    /**
     * Core Application Logic
     */
    showNewPromptModal() {
        this.editingPromptId = null;
        this.dom.newEditModalTitle.textContent = 'New Prompt';
        this.dom.promptForm.reset();
        this.dom.newEditModal.classList.add('active');
    }

    showEditPromptModal(id) {
        const promptToEdit = this.prompts.find(p => p.id === id);
        if (!promptToEdit) {
            this.showNotification('Prompt not found!', 'error');
            return;
        }

        this.editingPromptId = id;
        this.dom.newEditModalTitle.textContent = `Edit Prompt: ${promptToEdit.title}`;
        this.dom.promptTitleInput.value = promptToEdit.title;
        this.dom.promptContentInput.value = promptToEdit.content;
        this.dom.promptTagsInput.value = promptToEdit.tags.join(', ');
        this.dom.newEditModal.classList.add('active');
        this.closeModal(this.dom.promptDetailModal);
    }

    savePromptFromForm() {
        const title = this.dom.promptTitleInput.value.trim();
        const content = this.dom.promptContentInput.value.trim();
        const tagsInput = this.dom.promptTagsInput.value.trim();
        const tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag) : ['general'];

        if (!title || !content) {
            this.showNotification('Title and content are required!', 'error');
            return;
        }

        if (this.editingPromptId) {
            // Update existing prompt
            const index = this.prompts.findIndex(p => p.id === this.editingPromptId);
            if (index !== -1) {
                this.prompts[index] = {
                    ...this.prompts[index],
                    title,
                    preview: this.createPreview(content),
                    content,
                    tags
                };
                this.showNotification('Prompt updated successfully!', 'success');
            }
        } else {
            // Create new prompt
            const newPrompt = {
                id: Date.now(),
                title,
                preview: this.createPreview(content),
                content,
                tags,
                createdAt: new Date(),
                lastUsed: new Date(),
                useCount: 0
            };
            this.prompts.unshift(newPrompt);
            this.showNotification('Prompt created successfully!', 'success');
        }

        this.savePrompts();
        this.renderFilterTags();
        this.handleFilterAndSort();
        this.closeModal(this.dom.newEditModal);
    }

    deletePrompt(id) {
        if (!confirm('Are you sure you want to delete this prompt?')) return;
        this.prompts = this.prompts.filter(p => p.id !== id);
        this.savePrompts();
        this.renderFilterTags();
        this.handleFilterAndSort();
        this.closeModal(this.dom.promptDetailModal);
        this.showNotification('Prompt deleted successfully!', 'success');
    }

    filterPrompts() {
        this.filteredPrompts = this.prompts.filter(prompt => {
            const matchesFilter = this.currentFilter === 'all' || prompt.tags.includes(this.currentFilter);
            const matchesSearch = this.searchTerm === '' ||
                                prompt.title.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
                                prompt.content.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
                                prompt.tags.some(tag => tag.includes(this.searchTerm.toLowerCase()));
            return matchesFilter && matchesSearch;
        });
    }

    sortPrompts() {
        switch (this.dom.sortSelect.value) {
            case 'newest':
                this.filteredPrompts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
                break;
            case 'oldest':
                this.filteredPrompts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
                break;
            case 'alphabetical':
                this.filteredPrompts.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'most-used':
                this.filteredPrompts.sort((a, b) => b.useCount - a.useCount);
                break;
        }
    }

    renderPrompts() {
        if (this.filteredPrompts.length === 0) {
            this.dom.promptsGrid.style.display = 'none';
            this.dom.emptyState.style.display = 'flex';
            return;
        }

        this.dom.promptsGrid.style.display = 'grid';
        this.dom.emptyState.style.display = 'none';

        this.dom.promptsGrid.innerHTML = this.filteredPrompts.map(prompt => this.createPromptCard(prompt)).join('');
        this.bindPromptCardEvents();
    }

    createPromptCard(prompt) {
        const tagsHtml = prompt.tags.map(tag => `<span class="prompt-tag">${this.escapeHtml(tag)}</span>`).join('');
        const lastUsed = this.formatDate(prompt.lastUsed);
        
        return `
            <div class="prompt-card" data-id="${prompt.id}">
                <div class="prompt-header">
                    <div>
                        <h3 class="prompt-title">${this.escapeHtml(prompt.title)}</h3>
                        <div class="prompt-meta">Used ${prompt.useCount} times • Last used ${lastUsed}</div>
                    </div>
                </div>
                <div class="prompt-tags">${tagsHtml}</div>
                <div class="prompt-preview">${this.escapeHtml(this.createPreview(prompt.content))}</div>
                <div class="prompt-actions">
                    <button class="action-btn primary use-prompt-btn"><i class="fas fa-copy"></i> Use</button>
                    <button class="action-btn secondary edit-prompt-btn"><i class="fas fa-edit"></i> Edit</button>
                </div>
            </div>
        `;
    }

    bindPromptCardEvents() {
        document.querySelectorAll('.prompt-card').forEach(card => {
            const id = parseInt(card.dataset.id);
            const useBtn = card.querySelector('.use-prompt-btn');
            const editBtn = card.querySelector('.edit-prompt-btn');

            card.addEventListener('click', (e) => {
                if (e.target.closest('.action-btn')) return;
                this.showPromptDetailModal(id);
            });
            useBtn.addEventListener('click', () => this.usePrompt(id));
            editBtn.addEventListener('click', () => this.showEditPromptModal(id));
        });
    }
    
    showPromptDetailModal(id) {
        const prompt = this.prompts.find(p => p.id === id);
        if (!prompt) return;

        this.dom.detailTitle.textContent = this.escapeHtml(prompt.title);
        this.dom.detailContent.textContent = prompt.content;
        this.dom.detailTags.innerHTML = prompt.tags.map(tag => `<span class="prompt-tag">${this.escapeHtml(tag)}</span>`).join('');
        
        this.dom.detailUseBtn.onclick = () => this.usePrompt(id);
        this.dom.detailEditBtn.onclick = () => this.showEditPromptModal(id);
        this.dom.detailDeleteBtn.onclick = () => this.deletePrompt(id);
        
        this.dom.promptDetailModal.classList.add('active');
    }

    usePrompt(id) {
        const prompt = this.prompts.find(p => p.id === id);
        if (prompt) {
            navigator.clipboard.writeText(prompt.content).then(() => {
                this.showNotification(`'${prompt.title}' copied to clipboard!`, 'success');
                // Update use count and last used date
                prompt.useCount++;
                prompt.lastUsed = new Date();
                this.savePrompts();
                this.renderPrompts();
            }).catch(err => {
                this.showNotification('Failed to copy prompt.', 'error');
            });
        }
        this.closeModal(this.dom.promptDetailModal);
    }

    exportPrompts() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.prompts, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "promptforge_prompts.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        this.showNotification('Prompts exported successfully!', 'success');
    }

    importPrompts(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                if (!Array.isArray(imported)) {
                    throw new Error('Invalid file format');
                }

                this.prompts = imported.map(p => {
                    const tagsRaw = Array.isArray(p.tags) ? p.tags : (typeof p.tags === 'string' ? p.tags.split(',') : []);
                    const tags = tagsRaw.map(t => String(t).trim().toLowerCase()).filter(Boolean);
                    return {
                        ...p,
                        tags: tags.length ? tags : ['general'],
                        preview: p.preview || this.createPreview(p.content || ''),
                        createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
                        lastUsed: p.lastUsed ? new Date(p.lastUsed) : new Date(),
                        useCount: typeof p.useCount === 'number' ? p.useCount : 0
                    };
                });

                this.savePrompts();
                this.renderFilterTags();
                this.handleFilterAndSort();
                this.showNotification('Prompts imported successfully!', 'success');
            } catch (error) {
                console.error('Import failed:', error);
                this.showNotification(`Failed to import prompts: ${error.message}`, 'error');
            }
        };

        reader.readAsText(file);
        e.target.value = '';
    }

    closeModal(modalElement) {
        if (modalElement) {
            modalElement.classList.remove('active');
        }
    }

    /**
     * Utility Functions
     */
    createPreview(content) {
        const maxLength = 120;
        return content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
    }
    
    formatDate(date) {
        const now = new Date();
        const diffInDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
        const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));
        const diffInMinutes = Math.floor((now - date) / (1000 * 60));

        if (diffInDays > 30) {
            return date.toLocaleDateString();
        } else if (diffInDays > 0) {
            return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
        } else if (diffInHours > 0) {
            return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
        } else if (diffInMinutes > 0) {
            return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
        } else {
            return 'just now';
        }
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    loadAiSettings() {
        const savedSettings = localStorage.getItem('promptForgeAiSettings');
        if (savedSettings) {
            this.aiSettings = JSON.parse(savedSettings);
            if (this.dom.openrouterApiKey) {
                this.dom.openrouterApiKey.value = this.aiSettings.apiKey;
            }
            if (this.dom.enhancementPrompt) {
                this.dom.enhancementPrompt.value = this.aiSettings.enhancementPrompt;
            }
            
            if (this.aiSettings.apiKey) {
                this.fetchAiModels();
            }
        }
    }

    showAiSettingsModal() {
        if (this.dom.aiSettingsModal) {
            this.dom.aiSettingsModal.classList.add('active');
        }
    }

    async fetchAiModels() {
        if (!this.aiSettings.apiKey || !this.dom.aiModelSelect) {
            if (this.dom.aiModelSelect) {
                this.dom.aiModelSelect.innerHTML = '<option value="">Enter API Key first</option>';
            }
            return;
        }
        
        if (this.dom.modelLoadingSpinner) {
            this.dom.modelLoadingSpinner.style.display = 'block';
        }
        this.dom.aiModelSelect.innerHTML = '<option value="">Loading models...</option>';
        
        try {
            const response = await fetch('https://openrouter.ai/api/v1/models', {
                headers: {
                    'Authorization': `Bearer ${this.aiSettings.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch models');
            }
            
            const data = await response.json();
            this.dom.aiModelSelect.innerHTML = '<option value="">Select a model</option>';
            
            // Sort models alphabetically
            const sortedModels = data.data.sort((a, b) => a.name.localeCompare(b.name));
            
            sortedModels.forEach(model => {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = `${model.name} (${model.id})`;
                
                // Highlight free models
                if (model.pricing?.prompt === 0 && model.pricing?.completion === 0) {
                    option.textContent += ' - FREE';
                    option.style.color = '#00ff88'; // Green text for free models
                }
                
                // Mark currently selected model
                if (model.id === this.aiSettings.model) {
                    option.selected = true;
                }
                
                this.dom.aiModelSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error fetching models:', error);
            this.showNotification(`Failed to load models: ${error.message}`, 'error');
            this.dom.aiModelSelect.innerHTML = '<option value="">Error loading models</option>';
        } finally {
            if (this.dom.modelLoadingSpinner) {
                this.dom.modelLoadingSpinner.style.display = 'none';
            }
        }
    }

    saveAiSettings(e) {
        e.preventDefault();
        
        this.aiSettings = {
            apiKey: this.dom.openrouterApiKey.value.trim(),
            model: this.dom.aiModelSelect.value,
            enhancementPrompt: this.dom.enhancementPrompt.value.trim() || 
                             'You are an expert prompt engineer. Improve the following prompt for clarity, specificity and effectiveness while maintaining its original intent:'
        };
        
        localStorage.setItem('promptForgeAiSettings', JSON.stringify(this.aiSettings));
        this.showNotification('AI settings saved successfully!', 'success');
        this.closeModal(this.dom.aiSettingsModal);
    }

    async enhancePrompt() {
        if (!this.aiSettings.apiKey || !this.aiSettings.model) {
            this.showNotification('Please configure AI settings first', 'error');
            this.showAiSettingsModal();
            return;
        }
        
        const currentContent = this.dom.promptContentInput.value.trim();
        if (!currentContent) {
            this.showNotification('No prompt content to enhance', 'error');
            return;
        }
        
        try {
            this.dom.enhancePromptBtn.disabled = true;
            this.dom.enhancePromptBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enhancing...';
            
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.aiSettings.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.aiSettings.model,
                    messages: [
                        { 
                            role: "system", 
                            content: this.aiSettings.enhancementPrompt + "\n\n" + currentContent + 
                                    "\n\nIMPORTANT: Only return the improved prompt text exactly as it should be used."
                        }
                    ]
                })
            });
            
            if (!response.ok) throw new Error('API request failed');
            
            const result = await response.json();
            const enhancedContent = result.choices[0]?.message?.content?.trim();
            
            if (enhancedContent) {
                this.dom.promptContentInput.value = enhancedContent;
                this.showNotification('Prompt enhanced successfully!', 'success');
            } else {
                throw new Error('No enhanced content returned');
            }
        } catch (error) {
            this.showNotification(`Enhancement failed: ${error.message}`, 'error');
        } finally {
            this.dom.enhancePromptBtn.disabled = false;
            this.dom.enhancePromptBtn.innerHTML = '<i class="fas fa-magic"></i> Enhance with AI';
        }
    }

    showNotification(message, type = 'success', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        this.dom.notificationContainer.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, duration);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.promptForgeApp = new PromptForgeApp();
});
