importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

firebase.initializeApp({
  apiKey: "AIzaSyAUVrkqQ-_f3bm0sNZDukkgzJdkYgYSdeA",
  authDomain: "lifesaver-cloud.firebaseapp.com",
  projectId: "lifesaver-cloud",
  messagingSenderId: "525052016690",
  appId: "1:525052016690:web:e144bda9ab58ea5291242b"
});

firebase.messaging();