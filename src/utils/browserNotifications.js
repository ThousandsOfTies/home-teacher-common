// Use the existing application worker on mobile. Waiting for serviceWorker.ready
// without a registration can hang forever on desktop browsers and in development.
export async function showBrowserNotification(title, options = {}, onClick) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;

  let workerError;
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration?.active && typeof registration.showNotification === 'function') {
      await registration.showNotification(title, options);
      return true;
    }
  } catch (error) {
    workerError = error;
  }

  try {
    const notification = new Notification(title, options);
    notification.onclick = () => {
      if (onClick) onClick();
      else window.focus();
      notification.close();
    };
    return true;
  } catch (error) {
    throw workerError || error;
  }
}
