let loadingScreens = 0;
let loadedScreens = 0;

document.addEventListener('DOMContentLoaded', function() {
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const saveBtn = document.getElementById('saveSettings');
    const urlInputs = [
        document.getElementById('url1'),
        document.getElementById('url2'),
        document.getElementById('url3')
    ];
    const iframes = [
        document.getElementById('iframe1'),
        document.getElementById('iframe2'),
        document.getElementById('iframe3')
    ];
    const overlay = document.getElementById('overlay');
    const cacheToggle = document.getElementById('cacheToggle');

    // 设置初始状态
    settingsPanel.style.display = 'none';

    // 处理 iframe 加载完成事件
    function handleIframeLoad(iframe, skeleton) {
        iframe.style.display = 'block';
        iframe.classList.add('loaded');
        skeleton.style.display = 'none';
    }

    // 为每个 iframe 添加加载事件监听
    iframes.forEach((iframe, index) => {
        const skeleton = document.querySelector(`#screen${index + 1} .skeleton-loading`);
        iframe.addEventListener('load', () => handleIframeLoad(iframe, skeleton));
    });

    // 实现拖拽调整大小
    const resizers = document.querySelectorAll('.resizer');
    let isResizing = false;
    let currentResizer = null;
    let startX = 0;
    let startWidth = 0;
    let rafId = null;

    resizers.forEach(resizer => {
        resizer.addEventListener('mousedown', initResize);
    });

    function initResize(e) {
        isResizing = true;
        currentResizer = e.target;
        currentResizer.classList.add('active');

        // 记录初始位置和宽度
        startX = e.clientX;
        startWidth = currentResizer.parentElement.getBoundingClientRect().width;

        // 添加鼠标移动和松开事件监听
        document.addEventListener('mousemove', resize);
        document.addEventListener('mouseup', stopResize);

        // 防止文本选择
        e.preventDefault();
    }

    function resize(e) {
        if (!isResizing) return;

        // 如果已经有待处理的动画帧，取消它
        if (rafId) {
            cancelAnimationFrame(rafId);
        }

        // 使用 requestAnimationFrame 进行平滑动画
        rafId = requestAnimationFrame(() => {
            const screen = currentResizer.parentElement;
            const nextScreen = screen.nextElementSibling;
            
            // 计算移动距离
            const delta = e.clientX - startX;
            const newWidth = startWidth + delta;
            
            // 获取屏幕的位置信息
            const containerRect = screen.parentElement.getBoundingClientRect();
            
            const containerWidth = containerRect.width;
            
            // 设置最小和最大宽度限制
            const minWidth = 200;
            const maxWidth = containerWidth - minWidth;
            
            if (newWidth >= minWidth && newWidth <= maxWidth) {
                // 设置当前屏幕的宽度为百分比
                const widthPercentage = (newWidth / containerWidth) * 100;
                screen.style.width = `${widthPercentage}%`;
                screen.style.flex = 'none';
                
                // 重置下一个屏幕的flex以自适应
                if (nextScreen) {
                    nextScreen.style.flex = '1';
                    nextScreen.style.width = 'auto';
                }
            }
        });
    }

    function stopResize() {
        isResizing = false;
        if (currentResizer) {
            currentResizer.classList.remove('active');
            currentResizer = null;
        }
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        startX = 0;
        startWidth = 0;
        document.removeEventListener('mousemove', resize);
        document.removeEventListener('mouseup', stopResize);
    }

    // 从 storage 中加载缓存设置
    chrome.storage.sync.get(['cacheEnabled'], function(result) {
        cacheToggle.checked = result.cacheEnabled !== false; // 默认开启
    });

    // 保存缓存设置
    cacheToggle.addEventListener('change', function() {
        chrome.storage.sync.set({ cacheEnabled: cacheToggle.checked });
        if (!cacheToggle.checked) {
            // 如果关闭缓存，清除所有缓存
            clearAllCache();
        }
    });

    // 修改缓存相关函数
    function isCacheEnabled() {
        return cacheToggle.checked;
    }

    function saveToCache(url, content) {
        if (!isCacheEnabled()) return;
        try {
            const cacheKey = `page_cache_${url}`;
            const cacheData = {
                content: content,
                timestamp: Date.now(),
                url: url,
                // 添加 ETag 或 Last-Modified 信息
                etag: content.length.toString(36) + Date.now().toString(36)
            };
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (e) {
            console.warn('Cache save failed:', e);
        }
    }

    function getFromCache(url) {
        if (!isCacheEnabled()) return null;
        try {
            const cacheKey = `page_cache_${url}`;
            const cacheData = JSON.parse(localStorage.getItem(cacheKey));
            
            if (!cacheData) return null;

            const CACHE_DURATION = 60 * 60 * 1000; 
            if (Date.now() - cacheData.timestamp > CACHE_DURATION) {
                localStorage.removeItem(cacheKey);
                return null;
            }

            return cacheData;
        } catch (e) {
            console.warn('Cache read failed:', e);
            return null;
        }
    }

    function clearAllCache() {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('page_cache_')) {
                localStorage.removeItem(key);
            }
        });
    }

    // 修改清除缓存按钮
    const clearCacheBtn = document.createElement('button');
    clearCacheBtn.textContent = '清除缓存';
    clearCacheBtn.className = 'clear-cache-btn';
    clearCacheBtn.onclick = function() {
        clearAllCache();
        alert('缓存已清除');
    };
    document.querySelector('.cache-info').appendChild(clearCacheBtn);

    // 修改 loadUrl 函数
    function loadUrl(url, iframe, skeleton) {
        if (isCacheEnabled()) {
            const cachedData = getFromCache(url);
            if (cachedData) {
                skeleton.style.display = 'none';
                iframe.style.display = 'block';
                iframe.src = url;
                iframe.classList.add('loaded');
                updateCacheInBackground(url);
                return;
            }
        }
        
        loadingScreens++;
        NProgress.start();
        
        // 添加超时处理
        const timeoutId = setTimeout(() => {
            if (!iframe.classList.contains('loaded')) {
                handleLoadError(url, iframe, skeleton);
            }
        }, 15000); // 15秒超时

        skeleton.style.display = 'block';
        iframe.style.display = 'none';
        iframe.classList.remove('loaded');
        iframe.src = url;

        // 监听加载进度
        iframe.onload = function() {
            clearTimeout(timeoutId);
            loadedScreens++;
            NProgress.set(loadedScreens / loadingScreens);
            
            if (loadedScreens === loadingScreens) {
                NProgress.done();
                loadingScreens = loadedScreens = 0;
            }

            handleIframeLoad(iframe, skeleton);
            if (isCacheEnabled()) {
                try {
                    if (iframe.contentDocument) {
                        saveToCache(url, iframe.contentDocument.documentElement.outerHTML);
                    }
                } catch (e) {
                    console.warn('Unable to cache content:', e);
                }
            }
        };

        iframe.onerror = function() {
            clearTimeout(timeoutId);
            handleLoadError(url, iframe, skeleton);
        };
    }

    // 添加错误处理函数
    function handleLoadError(url, iframe, skeleton) {
        skeleton.style.display = 'none';
        iframe.style.display = 'block';
        iframe.srcdoc = `
            <div style="display:flex;justify-content:center;align-items:center;height:100%;flex-direction:column;font-family:system-ui;">
                <div style="margin-bottom:20px;">加载失败</div>
                <button onclick="window.location.reload()" style="padding:10px 20px;border:none;background:#4CAF50;color:white;border-radius:4px;cursor:pointer;">
                    重试
                </button>
            </div>
        `;
    }

    // 后台更新缓存
    function updateCacheInBackground(url) {
        if (!isCacheEnabled()) return;
        
        const cachedData = getFromCache(url);
        fetch(url, {
            headers: cachedData?.etag ? {
                'If-None-Match': cachedData.etag
            } : {}
        })
        .then(response => {
            if (response.status === 304) {
                // 内容未改变，更新时间戳
                if (cachedData) {
                    cachedData.timestamp = Date.now();
                    localStorage.setItem(`page_cache_${url}`, JSON.stringify(cachedData));
                }
                return null;
            }
            return response.text();
        })
        .then(content => {
            if (content) {
                saveToCache(url, content);
            }
        })
        .catch(error => {
            console.warn('Background cache update failed:', error);
        });
    }

    // 修改 iframe 加载事件处理
    iframes.forEach((iframe, index) => {
        const skeleton = document.querySelector(`#screen${index + 1} .skeleton-loading`);
        
        iframe.addEventListener('load', () => {
            handleIframeLoad(iframe, skeleton);
            
            // 页面加载完成后保存到缓存
            try {
                if (iframe.contentDocument) {
                    saveToCache(iframe.src, iframe.contentDocument.documentElement.outerHTML);
                }
            } catch (e) {
                console.warn('Unable to cache content:', e);
            }
        });
    });

    // 添加缓存清理功能
    function clearOldCache() {
        try {
            const CACHE_DURATION = 60 * 60 * 1000; // 1小时
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('page_cache_')) {
                    const cacheData = JSON.parse(localStorage.getItem(key));
                    if (Date.now() - cacheData.timestamp > CACHE_DURATION) {
                        localStorage.removeItem(key);
                    }
                }
            });
        } catch (e) {
            console.warn('Cache cleanup failed:', e);
        }
    }

    // 定期清理过期缓存
    setInterval(clearOldCache, 30 * 60 * 1000); // 每30分钟清理一次

    // 修改现有的 URL 加载逻辑
    chrome.storage.sync.get(['urls'], function(result) {
        if (!result.urls) {
            const defaultUrls = [
                'https://tradingeconomics.com/stocks',
                'https://hackerweb.app/',
                'https://rebang.today/'
            ];
            
            chrome.storage.sync.set({ urls: defaultUrls }, function() {
                defaultUrls.forEach((url, index) => {
                    const skeleton = document.querySelector(`#screen${index + 1} .skeleton-loading`);
                    urlInputs[index].value = url;
                    loadUrl(url, iframes[index], skeleton);
                });
            });
        } else {
            result.urls.forEach((url, index) => {
                const skeleton = document.querySelector(`#screen${index + 1} .skeleton-loading`);
                urlInputs[index].value = url;
                loadUrl(url, iframes[index], skeleton);
            });
        }
    });

    // 修改保存设置的逻辑
    saveBtn.addEventListener('click', function() {
        const urls = urlInputs.map(input => input.value);
        
        chrome.storage.sync.set({ urls: urls }, function() {
            urls.forEach((url, index) => {
                const skeleton = document.querySelector(`#screen${index + 1} .skeleton-loading`);
                loadUrl(url, iframes[index], skeleton);
            });
            settingsPanel.style.display = 'none';
            overlay.style.display = 'none';
        });
    });

    // 显示/隐藏设置面板
    settingsBtn.addEventListener('click', function() {
        if (settingsPanel.style.display === 'none') {
            settingsPanel.style.display = 'block';
            overlay.style.display = 'block';
        } else {
            settingsPanel.style.display = 'none';
            overlay.style.display = 'none';
        }
    });

    // 点击遮罩层关闭设置面板
    overlay.addEventListener('click', function() {
        settingsPanel.style.display = 'none';
        overlay.style.display = 'none';
    });

    function loadIframe(iframeId, url) {
        const iframe = document.getElementById(iframeId);
        const skeletonLoading = iframe.parentElement.querySelector('.skeleton-loading');
        const retryButton = iframe.parentElement.querySelector('.retry-button');
        
        if (!url) {
            skeletonLoading.style.display = 'none';
            iframe.style.display = 'none';
            return;
        }

        skeletonLoading.style.display = 'block';
        iframe.style.display = 'none';
        if (retryButton) {
            retryButton.style.display = 'none';
        }

        NProgress.start();

        iframe.src = url;
        iframe.onload = () => {
            iframe.style.display = 'block';
            skeletonLoading.style.display = 'none';
            NProgress.done();
        };

        iframe.onerror = () => {
            skeletonLoading.style.display = 'none';
            if (retryButton) {
                retryButton.style.display = 'flex';
            }
            NProgress.done();
        };
    }

    // 添加重试按钮的点击事件处理
    function setupRetryButtons() {
        for (let i = 1; i <= 3; i++) {
            const retryButton = document.getElementById(`retry${i}`);
            if (retryButton) {
                retryButton.addEventListener('click', () => {
                    const urlInput = document.getElementById(`url${i}`);
                    if (urlInput && urlInput.value) {
                        loadIframe(`iframe${i}`, urlInput.value);
                    }
                });
            }
        }
    }

    // 在初始化时调用
    setupRetryButtons();
}); 
