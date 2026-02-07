/**
 * News Lancashire v2 - Main JavaScript
 * Dark glass morphism theme
 * Features: mobile menu, borough dropdown, lazy loading, smooth scroll, header scroll, newsletter
 */

(function() {
  'use strict';

  /* ============================================================
     Mobile Menu
     ============================================================ */
  var MobileMenu = {
    init: function() {
      this.toggle = document.querySelector('.menu-toggle');
      this.nav = document.querySelector('.mobile-nav');
      this.body = document.body;

      if (!this.toggle || !this.nav) return;

      var self = this;

      this.toggle.addEventListener('click', function() {
        self.toggleMenu();
      });

      // Close menu when clicking on links
      this.nav.querySelectorAll('a').forEach(function(link) {
        link.addEventListener('click', function() {
          self.close();
        });
      });

      // Close on escape key
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && self.isOpen()) {
          self.close();
        }
      });
    },

    toggleMenu: function() {
      if (this.isOpen()) {
        this.close();
      } else {
        this.open();
      }
    },

    open: function() {
      this.nav.classList.add('active');
      this.toggle.setAttribute('aria-expanded', 'true');
      this.body.style.overflow = 'hidden';
    },

    close: function() {
      this.nav.classList.remove('active');
      this.toggle.setAttribute('aria-expanded', 'false');
      this.body.style.overflow = '';
    },

    isOpen: function() {
      return this.nav.classList.contains('active');
    }
  };

  /* ============================================================
     Borough Dropdown
     ============================================================ */
  var BoroughDropdown = {
    init: function() {
      this.dropdown = document.querySelector('.nav-dropdown');
      this.trigger = document.querySelector('.nav-dropdown-trigger');

      if (!this.dropdown || !this.trigger) return;

      var self = this;

      // Toggle on click
      this.trigger.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        self.toggle();
      });

      // Close when clicking outside
      document.addEventListener('click', function(e) {
        if (!self.dropdown.contains(e.target)) {
          self.close();
        }
      });

      // Close on escape
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          self.close();
        }
      });

      // Show on hover (desktop only)
      if (window.matchMedia('(min-width: 768px)').matches) {
        this.dropdown.addEventListener('mouseenter', function() {
          self.open();
        });

        this.dropdown.addEventListener('mouseleave', function() {
          self.close();
        });
      }
    },

    toggle: function() {
      if (this.dropdown.classList.contains('open')) {
        this.close();
      } else {
        this.open();
      }
    },

    open: function() {
      this.dropdown.classList.add('open');
      this.trigger.setAttribute('aria-expanded', 'true');
    },

    close: function() {
      this.dropdown.classList.remove('open');
      this.trigger.setAttribute('aria-expanded', 'false');
    }
  };

  /* ============================================================
     Lazy Image Loading
     ============================================================ */
  var LazyLoader = {
    init: function() {
      if ('loading' in HTMLImageElement.prototype) {
        this.nativeLazyLoad();
      } else {
        this.observerLazyLoad();
      }
    },

    nativeLazyLoad: function() {
      var images = document.querySelectorAll('img[data-src]');
      images.forEach(function(img) {
        img.src = img.dataset.src;
        img.loading = 'lazy';
        img.addEventListener('load', function() {
          img.classList.add('loaded');
        });
      });
    },

    observerLazyLoad: function() {
      var observer = new IntersectionObserver(function(entries, obs) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            var img = entry.target;
            img.src = img.dataset.src;
            img.addEventListener('load', function() {
              img.classList.add('loaded');
            });
            obs.unobserve(img);
          }
        });
      }, {
        rootMargin: '100px 0px',
        threshold: 0.01
      });

      document.querySelectorAll('img[data-src]').forEach(function(img) {
        observer.observe(img);
      });
    }
  };

  /* ============================================================
     Smooth Scroll
     ============================================================ */
  var SmoothScroll = {
    init: function() {
      document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
        anchor.addEventListener('click', function(e) {
          var targetId = anchor.getAttribute('href');
          if (targetId === '#') return;

          var target = document.querySelector(targetId);
          if (target) {
            e.preventDefault();
            target.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
          }
        });
      });
    }
  };

  /* ============================================================
     Header Scroll Shadow
     ============================================================ */
  var HeaderScroll = {
    init: function() {
      var header = document.querySelector('.site-header');
      if (!header) return;

      var threshold = 50;

      window.addEventListener('scroll', function() {
        var scrollY = window.pageYOffset || document.documentElement.scrollTop;

        if (scrollY > threshold) {
          header.classList.add('scrolled');
        } else {
          header.classList.remove('scrolled');
        }
      }, { passive: true });
    }
  };

  /* ============================================================
     Newsletter Form
     ============================================================ */
  var Newsletter = {
    init: function() {
      var forms = document.querySelectorAll('.newsletter-form, .footer-newsletter-form');
      forms.forEach(function(form) {
        form.addEventListener('submit', function(e) {
          e.preventDefault();

          var input = form.querySelector('input[type="email"]');
          var button = form.querySelector('button');

          if (!input || !input.value) return;

          // Disable form
          input.disabled = true;
          button.disabled = true;
          button.textContent = 'Sending...';

          // Show success after brief delay
          setTimeout(function() {
            // Find the nearest success message
            var successEl = form.parentElement.querySelector('.newsletter-success');
            if (successEl) {
              successEl.classList.add('show');
            }

            // Reset form
            form.style.display = 'none';
          }, 800);
        });
      });
    }
  };

  /* ============================================================
     Staggered Card Animation on Scroll
     ============================================================ */
  var CardAnimator = {
    init: function() {
      if (!('IntersectionObserver' in window)) return;

      var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            entry.target.style.animationPlayState = 'running';
            observer.unobserve(entry.target);
          }
        });
      }, {
        rootMargin: '0px 0px -50px 0px',
        threshold: 0.1
      });

      document.querySelectorAll('.article-card').forEach(function(card) {
        card.style.animationPlayState = 'paused';
        observer.observe(card);
      });
    }
  };

  /* ============================================================
     Initialize
     ============================================================ */
  function init() {
    MobileMenu.init();
    BoroughDropdown.init();
    LazyLoader.init();
    SmoothScroll.init();
    HeaderScroll.init();
    Newsletter.init();
    CardAnimator.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
