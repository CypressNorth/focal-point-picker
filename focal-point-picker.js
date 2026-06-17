/// <reference path="./types.d.ts" />

(function () {
  "use strict";
  /**
   * Wait for two animation frames
   * @returns {Promise<void>}
   */
  function nextTick() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  }
  /**
   * Test if the current browser supports async/await
   * @returns {boolean}
   */
  function supportsAsyncAwait() {
    try {
      new Function("return (async () => {})();");
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Self-iniziating custom element for a native experience
   */
  class FocalPointPicker extends HTMLElement {
    /** @type {HTMLInputElement} preview */
    input;
    /** @type {HTMLElement} preview */
    preview;
    /** @type {HTMLButtonElement} handle */
    handle;
    /** @type {HTMLButtonElement} resetButton */
    resetButton;
    /** @type {boolean} dragging */
    dragging = false;
    /** @type [number, number] */
    defaultPosition = [0.5, 0.5];

    constructor() {
      super();
      this.input = /** @type {!HTMLInputElement} */ (
        this.querySelector("input")
      );
      this.preview = /** @type {!HTMLInputElement} */ (
        this.querySelector("[data-focalpoint-preview]")
      );
      this.handle = /** @type {!HTMLButtonElement} */ (
        this.querySelector("[data-focalpoint-handle]")
      );
      this.resetButton = /** @type {!HTMLButtonElement} */ (
        this.querySelector("[data-focalpoint-reset]")
      );
    }

    /**
     * Called when the element is added to the DOM
     * @return {void}
     */
    connectedCallback() {
      if (!supportsAsyncAwait()) {
        console.error("The current browser doesn't support async / await.");
        return;
      }
      this.init();
    }

    /**
     * Initialize everyhing when connected to the DOM
     * @return {Promise<void>}
     */
    async init() {
      await nextTick();

      if (!document.contains(this)) {
        return;
      }

      this.defaultPosition = [
        window.focalPointPicker?.defaultPosition?.left ?? 0.5,
        window.focalPointPicker?.defaultPosition?.top ?? 0.5,
      ];

      this.resetButton?.addEventListener("click", this.reset);

      const scope =
        this.closest(".attachment-details") ||
        this.closest("#post-body-content") ||
        this.closest(".media-sidebar")?.querySelector(".attachment-info");

      if (scope) {
        const imageWrap =
          scope.querySelector(".thumbnail-image") ||
          scope.querySelector(".wp_attachment_image p");
        if (imageWrap) {
          this.prepareImageUI(imageWrap);
          return;
        }

        const videoWrap =
          scope.querySelector(".wp-video") ||
          scope.querySelector(".thumbnail-video");
        if (videoWrap) {
          this.initializeVideoUI(videoWrap);
          return;
        }
      }

      console.error("No image or video element found", this);
      return;
    }

    prepareImageUI(imageWrap) {
      if (imageWrap.hasAttribute("data-fcp-wrap")) {
        console.log("already initialized", this);
        return;
      }

      imageWrap.setAttribute("data-fcp-wrap", "");

      this.imageWrap = imageWrap;
      this.img = this.imageWrap.querySelector("img");
      if (!this.img) {
        console.error("no image found in imageWrap", this.imageWrap);
        return;
      }

      if (this.img.complete) {
        this.initializeUI();
      } else {
        this.img.addEventListener("load", this.initializeUI, { once: true });
      }
    }

    /**
     * Clean up after us the element is removed from the DOM
     * @return {void}
     */
    disconnectedCallback() {
      const { handle, preview, img, imageWrap, videoFrame, resetButton } = this;

      if (preview) {
        if (this._mirrorVideos) {
          preview
            .querySelectorAll("[data-portrait], [data-landscape]")
            .forEach((el) => {
              el.style.backgroundImage = "";
              el.style.overflow = "";
            });
        }
        this.appendChild(preview);
      }
      if (handle) {
        handle.removeEventListener("dblclick", this.reset);
        if (this._onPointerDown) {
          handle.removeEventListener("pointerdown", this._onPointerDown, {
            passive: false,
          });
          handle.removeEventListener("pointermove", this._onPointerMove, {
            passive: false,
          });
          handle.removeEventListener("pointerup", this._onPointerUp);
          handle.removeEventListener("pointercancel", this._onPointerCancel);
          handle.removeEventListener(
            "lostpointercapture",
            this._onPointerCancel,
          );
        }
        this.appendChild(handle);
      }
      if (img) {
        img.removeEventListener("click", this.onImageClick);
      }
      if (imageWrap) {
        imageWrap.removeAttribute("data-fcp-wrap");
      }
      if (videoFrame) {
        videoFrame.style.position = "";
      }
      if (this._syncCleanup) {
        this._syncCleanup();
        this._syncCleanup = null;
      }
      if (this._mirrorVideos) {
        for (const mv of this._mirrorVideos) {
          mv.pause();
          mv.remove();
        }
        this._mirrorVideos = null;
      }
      if (resetButton) {
        resetButton.removeEventListener("click", this.reset);
      }
      window.removeEventListener("resize", this.updateUIFromValue);
    }

    /**
     * Initialize the user interface
     * @return {void}
     */
    initializeUI = () => {
      const { imageWrap, img, handle, preview } = this;

      if (!imageWrap || !img) {
        console.error("Some elements are missing", { imageWrap, img });
        return;
      }

      imageWrap.appendChild(handle);
      document.body.appendChild(preview);

      preview.style.setProperty("--image", `url(${img.src})`);

      window.addEventListener("resize", this.updateUIFromValue);
      this.updateUIFromValue();

      img.addEventListener("click", this.onImageClick);

      handle.addEventListener("dblclick", this.reset);

      this.setupDraggable(handle, img);
    };

    /**
     * Initialize the user interface
     * @return {void}
     */
    initializeVideoUI = (videoWrapper) => {
      const { handle, preview } = this;

      let videoFrame;
      if (videoWrapper.classList.contains("wp-video")) {
        videoFrame = videoWrapper;
      } else {
        videoFrame = videoWrapper?.querySelector(
          ".thumbnail-video>.wp-media-wrapper.wp-video",
        );
      }

      if (!videoFrame) {
        console.warn(
          "No video frame found. Skipping showing focal point preview.",
        );
        return;
      }

      this.videoFrame = videoFrame;
      videoFrame.style.position = "relative";

      handle.title =
        "Drag to change the focal point of the video. Double-click to reset.";

      videoFrame.appendChild(handle);
      document.body.appendChild(preview);

      const mainVideo = videoFrame.querySelector("video");
      if (mainVideo && preview) {
        const containers = preview.querySelectorAll(
          "[data-portrait], [data-landscape]",
        );
        this._mirrorVideos = [];

        for (const container of containers) {
          container.style.backgroundImage = "none";
          container.style.overflow = "hidden";

          const mirror = document.createElement("video");
          for (const source of mainVideo.querySelectorAll("source")) {
            mirror.appendChild(source.cloneNode());
          }
          if (!mainVideo.querySelector("source") && mainVideo.src) {
            mirror.src = mainVideo.src;
          }
          mirror.muted = true;
          mirror.playsInline = true;
          mirror.preload = "auto";
          mirror.style.cssText =
            "width:100%;height:100%;object-fit:cover;object-position:var(--focal-left,50%) var(--focal-top,50%);pointer-events:none;display:block;";

          container.appendChild(mirror);
          mirror.load();
          this._mirrorVideos.push(mirror);
        }

        this._mainVideo = mainVideo;

        const playMirrors = () => {
          for (const mv of this._mirrorVideos) {
            if (mv.readyState >= 1) {
              mv.currentTime = mainVideo.currentTime;
              mv.play().catch(() => {});
            }
          }
        };

        const pauseMirrors = () => {
          for (const mv of this._mirrorVideos) {
            mv.pause();
          }
        };

        const seekMirrors = () => {
          const t = mainVideo.currentTime;
          for (const mv of this._mirrorVideos) {
            mv.currentTime = t;
            if (!mainVideo.paused && mv.readyState >= 1) {
              mv.play().catch(() => {});
            }
          }
        };

        const correctDrift = () => {
          const t = mainVideo.currentTime;
          for (const mv of this._mirrorVideos) {
            if (!mv.paused && Math.abs(mv.currentTime - t) > 0.5) {
              mv.currentTime = t;
            }
          }
        };

        mainVideo.addEventListener("play", playMirrors);
        mainVideo.addEventListener("pause", pauseMirrors);
        mainVideo.addEventListener("seeked", seekMirrors);
        mainVideo.addEventListener("timeupdate", correctDrift);

        this._syncCleanup = () => {
          mainVideo.removeEventListener("play", playMirrors);
          mainVideo.removeEventListener("pause", pauseMirrors);
          mainVideo.removeEventListener("seeked", seekMirrors);
          mainVideo.removeEventListener("timeupdate", correctDrift);
        };
      }

      window.addEventListener("resize", this.updateUIFromValue);
      this.updateUIFromValue();

      handle.addEventListener("dblclick", this.reset);

      this.setupDraggable(handle, videoFrame);
    };

    /**
     * Set up pointer-event-based dragging on the handle,
     * constrained to the given containment element.
     * @param {HTMLElement} handle
     * @param {HTMLElement} containment
     */
    setupDraggable(handle, containment) {
      if (this._onPointerDown) return;

      let startLeft,
        startTop,
        startX,
        startY,
        minLeftPct,
        maxLeftPct,
        minTopPct,
        maxTopPct;

      this._onPointerDown = (e) => {
        e.preventDefault();
        handle.setPointerCapture(e.pointerId);
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseFloat(handle.style.left) || 0;
        startTop = parseFloat(handle.style.top) || 0;

        const parent = handle.offsetParent;
        if (containment === parent) {
          minLeftPct = 0;
          maxLeftPct = 100;
          minTopPct = 0;
          maxTopPct = 100;
        } else {
          minLeftPct = (containment.offsetLeft / parent.offsetWidth) * 100;
          maxLeftPct =
            ((containment.offsetLeft + containment.offsetWidth) /
              parent.offsetWidth) *
            100;
          minTopPct = (containment.offsetTop / parent.offsetHeight) * 100;
          maxTopPct =
            ((containment.offsetTop + containment.offsetHeight) /
              parent.offsetHeight) *
            100;
        }

        this.dragging = true;
        this.togglePreview(true);
        document.body.setAttribute("data-fcp-dragging", "");
      };

      this._onPointerMove = (e) => {
        if (!handle.hasPointerCapture(e.pointerId)) return;
        e.preventDefault();

        const parentRect = handle.offsetParent.getBoundingClientRect();
        const dx = ((e.clientX - startX) / parentRect.width) * 100;
        const dy = ((e.clientY - startY) / parentRect.height) * 100;

        let newLeft = startLeft + dx;
        let newTop = startTop + dy;

        newLeft = Math.max(minLeftPct, Math.min(newLeft, maxLeftPct));
        newTop = Math.max(minTopPct, Math.min(newTop, maxTopPct));

        handle.style.left = `${newLeft}%`;
        handle.style.top = `${newTop}%`;

        this.applyFocalPointFromHandle();
      };

      this._onPointerUp = (e) => {
        if (!handle.hasPointerCapture(e.pointerId)) return;
        try {
          handle.releasePointerCapture(e.pointerId);
        } catch (_) {
          // capture may have been released by the browser already
        }

        this.dragging = false;
        this.togglePreview(false);
        document.body.removeAttribute("data-fcp-dragging");
        this.input.dispatchEvent(new Event("change", { bubbles: true }));
      };

      this._onPointerCancel = () => {
        this.dragging = false;
        this.togglePreview(false);
        document.body.removeAttribute("data-fcp-dragging");
        this.input.dispatchEvent(new Event("change", { bubbles: true }));
      };

      handle.addEventListener("pointerdown", this._onPointerDown, {
        passive: false,
      });
      handle.addEventListener("pointermove", this._onPointerMove, {
        passive: false,
      });
      handle.addEventListener("pointerup", this._onPointerUp);
      handle.addEventListener("pointercancel", this._onPointerCancel);
      handle.addEventListener("lostpointercapture", this._onPointerCancel);
    }

    /**
     * Handle window resize event
     * @return {void}
     */
    updateUIFromValue = () => {
      const [left, top] = this.getValueFromInput();
      this.setHandlePosition(left, top);
      this.updatePreview(left, top);
      this.adjustResetButton(left, top);
    };

    /**
     * Get the current focal point value from the input
     * @return {number[]} The current focal point values [left, top].
     */
    getValueFromInput() {
      const { input } = this;
      if (!input) {
        console.error("no input found", { input });
        return this.defaultPosition;
      }

      const inputValue = input.value.trim();
      const values = inputValue.split(" ");

      if (values.length > 2) {
        console.error("invalid value:", inputValue);
        return this.defaultPosition;
      }

      return values.map(function (/** @type {string} */ value) {
        let number = parseFloat(value);
        if (number > 1) {
          number /= 100;
        }
        return parseFloat(number.toFixed(2));
      });
    }

    /**
     * Get the focal point from the handle position
     * @return {number[]} The focal point values [left, top].
     */
    getValueFromHandle() {
      const { img, imageWrap } = this;

      let left = parseFloat(this.handle.style.left) / 100;
      let top = parseFloat(this.handle.style.top) / 100;

      if (isNaN(left) || isNaN(top) || !isFinite(left) || !isFinite(top)) {
        return this.defaultPosition;
      }

      if (img && imageWrap) {
        left =
          (left * imageWrap.offsetWidth - img.offsetLeft) / img.offsetWidth;
        top = (top * imageWrap.offsetHeight - img.offsetTop) / img.offsetHeight;
      }

      return [parseFloat(left.toFixed(2)), parseFloat(top.toFixed(2))];
    }

    /**
     * Handle image click event
     * @param {MouseEvent} e - The mouse event.
     * @return {void}
     */
    onImageClick = (e) => {
      const { imageWrap } = this;
      if (!imageWrap) {
        return;
      }

      const rect = imageWrap.getBoundingClientRect();
      const pctLeft = ((e.clientX - rect.left) / rect.width) * 100;
      const pctTop = ((e.clientY - rect.top) / rect.height) * 100;

      this.animateHandle(pctLeft, pctTop).then(() => {
        this.applyFocalPointFromHandle();
        this.input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };

    /**
     * Animate the handle to a position and apply the new point
     * after the animation
     * @param {number} left
     * @param {number} top
     */
    animateHandle(left, top) {
      const fromLeft = this.handle.style.left || "50%";
      const fromTop = this.handle.style.top || "50%";
      const animation = this.handle.animate(
        [
          { left: fromLeft, top: fromTop },
          { left: `${left}%`, top: `${top}%` },
        ],
        { duration: 200, fill: "forwards" },
      );
      return animation.finished.then(() => {
        animation.cancel();
        this.handle.style.left = `${left}%`;
        this.handle.style.top = `${top}%`;
      });
    }

    /**
     * Resets the focal point
     */
    reset = () => {
      this.setHandlePosition(...this.defaultPosition);
      this.applyFocalPointFromHandle();
      this.input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    /**
     * Set the handle position, based on the image
     * @param {number} left - The left position as a number between 0-1.
     * @param {number} top - The top position as a number between 0-1.
     * @return {void}
     */
    setHandlePosition(left, top) {
      const { handle, img, imageWrap } = this;

      if (!handle.isConnected) {
        return;
      }

      let leftPct = left * 100;
      let topPct = top * 100;

      if (img && imageWrap) {
        leftPct =
          ((img.offsetLeft + img.offsetWidth * left) / imageWrap.offsetWidth) *
          100;
        topPct =
          ((img.offsetTop + img.offsetHeight * top) / imageWrap.offsetHeight) *
          100;
      }

      const clamp = (val) => Math.max(0, Math.min(100, val));
      handle.style.setProperty("left", `${clamp(leftPct)}%`);
      handle.style.setProperty("top", `${clamp(topPct)}%`);
    }

    /**
     * Apply the focal point values based on the handle position
     * @return {void}
     */
    applyFocalPointFromHandle = () => {
      const [left, top] = this.getValueFromHandle();
      this.updateInput(left, top);
      this.updatePreview(left, top);
      this.adjustResetButton(left, top);
    };

    /**
     * Update the input
     * @param {number} left
     * @param {number} top
     */
    updateInput(left, top) {
      this.input.value = `${left} ${top}`;
    }

    /**
     * Check if a value is equal to the default value
     * @param {number} left
     * @param {number} top
     * @return {void}
     */
    adjustResetButton(left, top) {
      if (this.resetButton) {
        this.resetButton.disabled = this.isDefaultPosition(left, top);
      }
    }

    /**
     * Check if a value is equal to the default value
     * @param {number} left
     * @param {number} top
     * @return {boolean}
     */
    isDefaultPosition(left, top) {
      return (
        left === this.defaultPosition[0] && top === this.defaultPosition[1]
      );
    }

    /**
     * Toggles the visibility of the preview pane
     * @param {boolean} visible
     * @return {void}
     */
    togglePreview(visible) {
      if (typeof visible !== "boolean") {
        throw new Error("togglePreview expects a boolean value");
      }
      if (!this.preview) {
        return;
      }
      this.preview.classList.toggle("is-visible", visible);
    }

    /**
     * Set the preview position
     * @param {number} left
     * @param {number} top
     * @return {void}
     */
    updatePreview(left, top) {
      if (!this.preview) {
        return;
      }
      if (typeof left !== "number") {
        console.error("'left' must be a number:", left);
        return;
      }
      if (typeof top !== "number") {
        console.error("'top' must be a number:", top);
        return;
      }
      this.preview.style.setProperty("--focal-left", `${left * 100}%`);
      this.preview.style.setProperty("--focal-top", `${top * 100}%`);
    }
  }

  customElements.define("focal-point-picker", FocalPointPicker);
})();
