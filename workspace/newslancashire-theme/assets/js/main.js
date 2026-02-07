/**
 * News Lancashire Theme - Main JavaScript
 * Features: Dark mode, mobile menu, lazy loading, smooth scroll
 */

(function() {
  'use strict';

  // Dark Mode functionality
  const DarkMode = {
    key: 'nl-theme-preference',
    
    init() {
      this.toggle = document.querySelector('.theme-toggle');
      this.iconSun = document.querySelector('.icon-sun');
      this.iconMoon = document.querySelector('.icon-moon');
      
      if (!this.toggle) return;
      
      // Check for saved preference or system preference
      const savedTheme = localStorage.getItem(this.key);
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      
      if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        this.enable();
      } else {
        this.disable();
      }
      
      this.toggle.addEventListener('click', () => this.toggleTheme());
      
      // Listen for system preference changes
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem(this.key)) {
          e.matches ? this.enable() : this.disable();
        }
      });
    },
    
    enable() {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem(this.key, 'dark');
      this.updateIcon(true);
    },
    
    disable() {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem(this.key, 'light');
      this.updateIcon(false);
    },
    
    toggleTheme() {
      if (document.documentElement.getAttribute('data-theme') === 'dark') {
        this.disable();
      } else {
        this.enable();
      }
    },
    
    updateIcon(isDark) {
      if (this.iconSun && this.iconMoon) {
        this.iconSun.style.display = isDark ? 'block' : 'none';
        this.iconMoon.style.display = isDark ? 'none' : 'block';
      }
    }
  };

  // Mobile Menu functionality
  const MobileMenu = {
    init() {
      this.toggle = document.querySelector('.menu-toggle');
      this.nav = document.querySelector('.mobile-nav');
      this.body = document.body;
      
      if (!this.toggle || !this.nav) return;
      
      this.toggle.addEventListener('click', () => this.toggleMenu());
      
      // Close menu when clicking on links
      this.nav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => this.close());
      });
      
      // Close on escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen()) {
          this.close();
        }
      });
    },
    
    toggleMenu() {
      if (this.isOpen()) {
        this.close();
      } else {
        this.open();
      }
    },
    
    open() {
      this.nav.classList.add('active');
      this.toggle.setAttribute('aria-expanded', 'true');
      this.body.style.overflow = 'hidden';
    },
    
    close() {
      this.nav.classList.remove('active');
      this.toggle.setAttribute('aria-expanded', 'false');
      this.body.style.overflow = '';
    },
    
    isOpen() {
      return this.nav.classList.contains('active');
    }
  };

  // Lazy Loading for images
  const LazyLoader = {
    init() {
      // Check for native lazy loading support
      if ('loading' in HTMLImageElement.prototype) {
        this.nativeLazyLoad();
      } else {
        this.intersectionObserverLazyLoad();
      }
    },
    
    nativeLazyLoad() {
      const lazyImages = document.querySelectorAll('img[data-src]');
      lazyImages.forEach(img => {
        img.src = img.dataset.src;
        img.loading = 'lazy';
        img.classList.add('loaded');
      });
    },
    
    intersectionObserverLazyLoad() {
      const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            img.classList.add('loaded');
            observer.unobserve(img);
          }
        });
      }, {
        rootMargin: '50px 0px',
        threshold: 0.01
      });
      
      document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
      });
    }
  };

  // Smooth scroll for anchor links
  const SmoothScroll = {
    init() {
      document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
          const targetId = anchor.getAttribute('href');
          if (targetId === '#') return;
          
          const targetElement = document.querySelector(targetId);
          if (targetElement) {
            e.preventDefault();
            targetElement.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
          }
        });
      });
    }
  };

  // Reading time calculator
  const ReadingTime = {
    init() {
      const article = document.querySelector('.article-single-content');
      if (!article) return;
      
      const text = article.textContent || article.innerText;
      const wordCount = text.trim().split(/\s+/).length;
      const readingTime = Math.ceil(wordCount / 200); // 200 words per minute
      
      const readingTimeElement = document.querySelector('.reading-time-value');
      if (readingTimeElement) {
        readingTimeElement.textContent = readingTime + ' min read';
      }
    }
  };

  // Header scroll behavior
  const HeaderScroll = {
    init() {
      const header = document.querySelector('.site-header');
      if (!header) return;
      
      let lastScroll = 0;
      const scrollThreshold = 100;
      
      window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > scrollThreshold) {
          header.classList.add('scrolled');
        } else {
          header.classList.remove('scrolled');
        }
        
        lastScroll = currentScroll;
      }, { passive: true });
    }
  };

  // Initialize all modules when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  function init() {
    DarkMode.init();
    MobileMenu.init();
    LazyLoader.init();
    SmoothScroll.init();
    ReadingTime.init();
    HeaderScroll.init();
  }
})();
