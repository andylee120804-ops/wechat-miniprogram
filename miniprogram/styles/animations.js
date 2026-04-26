/**
 * Animation Configuration - Premium WeChat Mini-Program
 *
 * Preset animation definitions and helpers for wx.createAnimation().
 * Each preset defines the property transitions and default duration.
 */

const ANIMATIONS = {
  fadeIn: {
    opacity: [0, 1],
    duration: 300
  },
  fadeOut: {
    opacity: [1, 0],
    duration: 200
  },
  slideUp: {
    translateY: ['100%', '0%'],
    opacity: [0, 1],
    duration: 400
  },
  slideDown: {
    translateY: ['0%', '100%'],
    duration: 300
  },
  slideInRight: {
    translateX: ['100%', '0%'],
    duration: 300
  },
  scaleIn: {
    scale: [0.8, 1],
    opacity: [0, 1],
    duration: 300
  },
  scalePress: {
    scale: [1, 0.97],
    duration: 100
  },
  shakeX: {
    translateX: [0, -10, 10, -10, 10, 0],
    duration: 400
  },
  pulse: {
    scale: [1, 1.05, 1],
    duration: 600
  },
  numberCount: {
    _type: 'numberCount',
    duration: 600
  }
}

// Easing presets matching the design tokens
const EASING = {
  default: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeSpring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  linear: 'linear'
}

/**
 * Create a wx.createAnimation() configuration object for a given animation type.
 *
 * @param {string} type - Animation preset name (e.g. 'fadeIn', 'slideUp')
 * @param {object} options - Override options
 * @param {number} [options.duration] - Override duration in ms
 * @param {string} [options.timingFunction] - Override easing
 * @param {number} [options.delay] - Delay before animation starts in ms
 * @param {string} [options.transformOrigin] - Transform origin (default '50% 50% 0')
 * @returns {object} Config object for wx.createAnimation(), plus an apply() helper
 */
function createAnimation(type, options) {
  if (options === void 0) options = {}

  var preset = ANIMATIONS[type]
  if (!preset) {
    console.warn('[animations] Unknown animation type: ' + type)
    return null
  }

  var duration = options.duration !== undefined ? options.duration : preset.duration
  var timingFunction = options.timingFunction || EASING.default
  var delay = options.delay || 0
  var transformOrigin = options.transformOrigin || '50% 50% 0'

  // Build the base wx.createAnimation config
  var config = {
    duration: duration,
    timingFunction: timingFunction,
    delay: delay,
    transformOrigin: transformOrigin
  }

  // Build step instructions for applying the animation
  var steps = []

  // Handle multi-step animations (shakeX, pulse)
  if (type === 'shakeX') {
    var values = preset.translateX
    for (var i = 0; i < values.length; i++) {
      steps.push({ translateX: values[i] })
    }
  } else if (type === 'pulse') {
    var scaleValues = preset.scale
    for (var j = 0; j < scaleValues.length; j++) {
      steps.push({ scale: scaleValues[j] })
    }
  } else {
    // Standard two-value transitions
    var step = {}
    if (preset.opacity) step.opacity = preset.opacity[1]
    if (preset.translateY) step.translateY = preset.translateY[1]
    if (preset.translateX) step.translateX = preset.translateX[1]
    if (preset.scale) step.scale = preset.scale[1]
    steps.push(step)
  }

  return {
    config: config,
    steps: steps,
    type: type,

    /**
     * Apply the animation to a wx.createAnimation instance.
     * @param {object} animation - A wx.createAnimation() instance
     * @returns {object} The animation instance with steps applied, ready for .step().export()
     */
    apply: function (animation) {
      if (!animation) return null

      var anim = animation

      // For multi-step animations, each step gets its own .step() call
      if (steps.length > 1) {
        var stepDuration = Math.floor(duration / steps.length)
        for (var k = 0; k < steps.length; k++) {
          var s = steps[k]
          if (s.translateX !== undefined) anim = anim.translateX(s.translateX)
          if (s.scale !== undefined) anim = anim.scale(s.scale)
          if (s.opacity !== undefined) anim = anim.opacity(s.opacity)
          if (s.translateY !== undefined) anim = anim.translateY(s.translateY)
          anim = anim.step({
            duration: stepDuration,
            timingFunction: timingFunction,
            delay: delay,
            transformOrigin: transformOrigin
          })
        }
      } else {
        // Single-step animation
        var singleStep = steps[0]
        if (singleStep.opacity !== undefined) anim = anim.opacity(singleStep.opacity)
        if (singleStep.translateY !== undefined) anim = anim.translateY(singleStep.translateY)
        if (singleStep.translateX !== undefined) anim = anim.translateX(singleStep.translateX)
        if (singleStep.scale !== undefined) anim = anim.scale(singleStep.scale)
        anim = anim.step(config)
      }

      return anim
    }
  }
}

/**
 * Calculate stagger delay for list animations.
 * @param {number} index - Item index in the list (0-based)
 * @param {number} baseDelay - Base delay between items in ms (default 50)
 * @returns {number} Delay in ms for the item at the given index
 */
function getStaggerDelay(index, baseDelay) {
  if (baseDelay === void 0) baseDelay = 50
  return index * baseDelay
}

module.exports = { ANIMATIONS, EASING, createAnimation, getStaggerDelay }
