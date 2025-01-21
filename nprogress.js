/* NProgress, (c) 2013, 2014 Rico Sta. Cruz - http://ricostacruz.com/nprogress
 * @license MIT */

;(function(root, factory) {
  // 简化版本的 NProgress 代码
  var NProgress = {};

  NProgress.start = function() {
    if (!NProgress.status) {
      NProgress.set(0);
    }
  };

  NProgress.set = function(n) {
    var started = NProgress.isStarted();

    n = clamp(n, 0, 1);
    NProgress.status = (n === 1 ? null : n);

    var progress = NProgress.render(!started),
        bar      = progress.querySelector('.bar'),
        speed    = 200,
        ease     = 'cubic-bezier(0.1, 0.7, 0.1, 1)';

    bar.style.transition = 'all ' + speed + 'ms ' + ease;
    bar.style.transform = 'translate3d(' + toBarPerc(n) + '%,0,0)';

    return progress;
  };

  NProgress.done = function() {
    NProgress.set(1);
  };

  NProgress.isStarted = function() {
    return typeof NProgress.status === 'number';
  };

  NProgress.render = function(fromStart) {
    if (NProgress.isRendered()) return document.getElementById('nprogress');

    document.body.classList.add('nprogress-custom-parent');

    var progress = document.createElement('div');
    progress.id = 'nprogress';
    progress.innerHTML = '<div class="bar"></div>';

    var bar = progress.querySelector('.bar');
    bar.style.transition = 'all 0 linear';
    bar.style.transform = 'translate3d(' + toBarPerc(0) + '%,0,0)';

    document.body.appendChild(progress);
    return progress;
  };

  NProgress.isRendered = function() {
    return !!document.getElementById('nprogress');
  };

  function clamp(n, min, max) {
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function toBarPerc(n) {
    return (-1 + n) * 100;
  }

  root.NProgress = NProgress;
})(this); 
