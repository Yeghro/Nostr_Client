(function() {
  var { getSharedSecret, schnorr, utils } = nobleSecp256k1;
  var crypto = window.crypto;
  function getRand(size) {
    return crypto.getRandomValues(new Uint8Array(size));
  }
  var sha256 = bitcoinjs.crypto.sha256;
  var metadataStore = {};  // Global object to store metadata
  
  
  // Key pair generation
  var keypair = bitcoinjs.ECPair.makeRandom();
  var privateKey = keypair.privateKey.toString("hex");
  var publicKey = keypair.publicKey.toString("hex").substring(2);
  console.log("Public Key:", publicKey);
  
  
  var sockets = {};  // Object to store WebSocket connections
  var relays = [
    "wss://nostrpub.yeghro.site",  // Main relay
    "wss://relay.damus.io",
    "wss://purplepag.es",
    "wss://relay.primal.net"
    // Add more relay URLs as needed
  ];
  
  
  
  // Object to store subscriptions for each relay
  var subscriptions = {};  
  
  document.addEventListener('DOMContentLoaded', function() {
    connectToRelays();
  });
  
  function updateMainRelayStatus(status) {
    document.getElementById('main-relay-status').textContent = "Main Relay Status: " + status;
  }
  
  function updateMetadataRelayStatus(status) {
    var metadataRelayStatus = document.getElementById('metadata-relay-status');
    var listItem = document.createElement('li');
    listItem.textContent = status;
    metadataRelayStatus.appendChild(listItem);
  }
  
  function connectToRelay(relay, index) {
    console.log("Attempting to connect to relay:", relay);
  
    var socket = new WebSocket(relay);
    sockets[relay] = socket;
  
    socket.addEventListener('open', function() {
      if (index === 0) {
        console.log("Connected to main relay:", relay);
        updateMainRelayStatus('Connected to main relay: ' + relay);
        fetchGlobalEvents();
      } else {
        console.log("Connected to metadata relay:", relay);
        updateMetadataRelayStatus('Connected to metadata relay: ' + relay);
      }
  
      const filter = (index === 0) ? { kinds: [0, 1], limit: 50 } : { kinds: [0], limit: 50 };
      const subId = 'metadata-' + Math.random().toString(36).substr(2, 9);
      socket.send(JSON.stringify(['REQ', subId, filter]));
    });
  
    socket.addEventListener('message', function(message) {
      handleWebSocketMessage(message, relay);
    });
    
    socket.addEventListener('close', () => {
      console.log("Disconnected from relay:", relay);
      if (index === 0) {
        updateMainRelayStatus('Disconnected from main relay: ' + relay);
      } else {
        updateMetadataRelayStatus('Disconnected from metadata relay: ' + relay);
      }
      reconnectToRelay(relay, index);
    });
  
    socket.addEventListener('error', function(error) {
      console.error("Error connecting to relay:", relay, error);
      if (index === 0) {
        updateMainRelayStatus('Error connecting to main relay: ' + relay);
      } else {
        updateMetadataRelayStatus('Error connecting to metadata relay: ' + relay);
      }
    });
  }
  
  function connectToRelays() {
    console.log("Connecting to relays...");
  
    relays.forEach((relay, index) => {
      connectToRelay(relay, index);
    });
  }
  
  function reconnectToRelay(relay, index) {
    setTimeout(() => {
      console.log("Reconnecting to relay:", relay);
      if (index === 0) {
        updateMainRelayStatus('Reconnecting to main relay: ' + relay);
      } else {
        updateMetadataRelayStatus('Reconnecting to metadata relay: ' + relay);
      }
  
      connectToRelay(relay, index);
    }, 10000);
  }
  
  // Function to handle WebSocket message event
  async function handleWebSocketMessage(message, relay) {
    console.log('Received message from relay:', relay);
    console.log('Subscriptions:', subscriptions);
    console.log('Relay:', relay);
  
    if (!message.data || typeof message.data === 'undefined') {
        console.error('Received undefined message data');
        return;
    }
  
    let type, subId, event;
    try {
        [type, subId, event] = JSON.parse(message.data);
    } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        console.error('Invalid message data:', message.data);
        displayErrorMessage('Failed to parse WebSocket message. Please try again.'); // Display user-friendly error message
        return;
    }
  
    if (type === 'EVENT') {
      console.log('Received event:', event);
      if (event.kind === 0) {
          // Process and store metadata for kind 0 events
          try {
              var metadata = JSON.parse(event.content);
              metadataStore[event.publicKey] = metadata;
              console.log('Stored metadata for publicKey:', event.publicKey, metadata);
          } catch (error) {
              console.error('Error parsing metadata:', error);
          }
      }
  
      if (subId.startsWith('global-')) {
        addGlobalEvent(event);  // Display global events in the UI
    } else {
        var relaySubscriptions = subscriptions[relay] || [];
        var matchingSubscription = relaySubscriptions.find(subscription => subscription.subId === subId);
        if (matchingSubscription) {
            // Display subscribed events in the UI
            addSubscribedEvent(event);
            console.log('Received event:', event);
        } else {
            console.warn('Received event for unsubscribed filter:', subId, 'from relay:', relay);
        }
    }
  }
  }
  
  // Function to handle WebSocket error event
  function handleWebSocketError(error) {
      console.error("WebSocket error:", error);
  }
  
  // Function to generate new keys and update the public key display
  function generateKeys() {
      keypair = bitcoinjs.ECPair.makeRandom();
      privKey = keypair.privateKey.toString("hex");
      publicKey = keypair.publicKey.toString("hex").substring(2);
      document.getElementById('public-key').textContent = publicKey;
  }
  
  // Function to render the list of relays in the UI
  function renderRelayList() {
    const relayList = document.getElementById('relay-list');
    relayList.innerHTML = '';
  
    relays.forEach((relay, index) => {
      const listItem = document.createElement('li');
      listItem.textContent = relay;
  
      const removeButton = document.createElement('button');
      removeButton.textContent = 'Remove';
      removeButton.addEventListener('click', function() {
        removeRelay(index);
      });
  
      listItem.appendChild(removeButton);
      relayList.appendChild(listItem);
    });
  }
  
  
  // Function to remove a relay
  function removeRelay(index) {
    const relayURL = relays[index];
    relays.splice(index, 1);
    renderRelayList();
    disconnectFromRelay(relayURL);
  }
  
  // Function to disconnect from a relay
  function disconnectFromRelay(relayURL) {
    const socket = sockets[relayURL];
    if (socket) {
      socket.close();
      delete sockets[relayURL];
    }
  }
  
  // Get the modal and the button that opens it
  const relayModal = document.getElementById('relay-modal');
  const openRelayModalBtn = document.getElementById('open-relay-modal');
  
  // Get the <span> element that closes the modal
  const closeBtn = document.getElementsByClassName('close')[0];
  
  // Open the modal when the button is clicked
  openRelayModalBtn.addEventListener('click', () => {
    relayModal.style.display = 'block';
  });
  
  // Close the modal when the close button is clicked
  closeBtn.addEventListener('click', () => {
    relayModal.style.display = 'none';
  });
  
  // Close the modal when clicking outside of it
  window.addEventListener('click', function(event) {
    if (event.target === relayModal) {
      relayModal.style.display = 'none';
    }
  });
  
  // Event listener for the Add Relay button
  document.getElementById('add-relay-btn').addEventListener('click', addRelay);
  
  // Initial rendering of the relay list
  renderRelayList();
  
  
  function addRelay() {
    const relayInput = document.getElementById('relay-input');
    const relayURL = relayInput.value.trim();
  
    if (relayURL !== '') {
      relays.push(relayURL);
      relayInput.value = '';
      renderRelayList();
      connectToRelay(relayURL, relays.length - 1);
    }
  }
  
  // Function to handle the publish form submission
  async function handlePublishFormSubmit(event) {
      event.preventDefault();
  
      var content = document.getElementById('note-content').value;
      var tags = document.getElementById('note-tags').value.split(',').map(tag => tag.trim());
  
      await publishEvent(content, tags);
  
      document.getElementById('note-content').value = '';
      document.getElementById('note-tags').value = '';
      alert('Event published successfully!');
  }
  
  // Function to add a subscription
  function addSubscription(relay, subId, filter) {
    if (!subscriptions[relay]) {
        subscriptions[relay] = [];
    }
    subscriptions[relay].push({ subId: subId, filter: filter });
    console.log('Added subscription:', { relay, subId, filter });
  }
  
  
// Function to sign and publish an event
async function publishEvent(content, tags, publicKey, privateKey) {
  try {
    // Sanitize user input
    var sanitizedContent = sanitizeInput(content);
    var sanitizedTags = tags.map(tag => sanitizeInput(tag));

    var unsignedEvent = {
      pubkey: publicKey,
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: sanitizedTags,
      content: sanitizedContent
    };

    var signedEvent = await getSignedEvent(unsignedEvent, privateKey);

    var relaySocket = sockets['wss://nostrpub.yeghro.site'];
    if (relaySocket && relaySocket.readyState === WebSocket.OPEN) {
      displayLoadingState(); // Show loading state

      // Network error handling
      relaySocket.addEventListener('error', function() {
        displayErrorMessage('Network error occurred while publishing the event.');
      });

      relaySocket.send(JSON.stringify(['EVENT', signedEvent]));

      // Wait for event publication confirmation or timeout
      var confirmationTimeout = setTimeout(() => {
        hideLoadingState(); // Hide loading state
        displayErrorMessage('Event publication timed out. Please try again.'); // Display timeout error message
      }, 5000);

      relaySocket.addEventListener('message', function confirmationListener(event) {
        var [type, , eventId] = JSON.parse(event.data);
        if (type === 'OK' && eventId === signedEvent.id) {
          clearTimeout(confirmationTimeout);
          hideLoadingState(); // Hide loading state
          displaySuccessMessage('Event published successfully!'); // Display success message
          relaySocket.removeEventListener('message', confirmationListener);
        } else if (type === 'ERR') {
          // Server response error handling
          clearTimeout(confirmationTimeout);
          hideLoadingState(); // Hide loading state
          displayErrorMessage('Server error occurred while publishing the event.');
          relaySocket.removeEventListener('message', confirmationListener);
        }
      });
    } else {
      displayErrorMessage('The specified relay socket is not available or not open.'); // Display relay connection error message
    }
  } catch (error) {
    console.error('Error publishing event:', error);
    displayErrorMessage('Failed to publish event. Please try again.'); // Display general error message
  }
}
  
  function sanitizeInput(input) {
    return DOMPurify.sanitize(input, {ALLOWED_TAGS: [], ALLOWED_ATTR: []});
  }
  
  // Function to sign an event
  async function signEvent(event, privateKey) {
    var eventData = JSON.stringify([
          0,
          event['publicKey'],
          event['created_at'],
          event['kind'],
          event['tags'],
          event['content']
      ]);
      event.id = sha256(eventData).toString('hex');
      event.sig = await schnorr.sign(event.id, privateKey);
      return event;
  }
  
  // Function to create an event element
  function createEventElement(event) {
    const eventElement = document.createElement('div');
    eventElement.classList.add('event');
  
    let metadata = {};
    if (event.kind === 0) {
        // Store metadata for kind 0 events
        metadata = JSON.parse(event.content);
        metadataStore[event.publicKey] = metadata;
    } else if (event.kind === 1) {
        // Use stored metadata for kind 1 events
        metadata = metadataStore[event.publicKey] || {};
    }
  
    // Use the metadata for displaying the event
    const profilePictureUrl = metadata.picture || 'https://yeghro.site/wp-content/uploads/2024/03/nostr.webp';
  
    eventElement.innerHTML = `
        <div class="event-header">
            <img class="event-picture" src="${profilePictureUrl}" alt="Profile Picture" style="width: 200px; height: 200px; object-fit: cover;">
            <div class="event-info">
                <p class="event-name">${metadata.name || 'Unknown'}</p>
                <p class="event-timestamp">${event.created_at ? new Date(event.created_at * 1000).toLocaleString() : 'Unknown'}</p>
            </div>
        </div>
        <p class="event-content">${event.kind === 1 ? event.content : ''}</p>
    `;
  
    return eventElement;
  }
  
  // Function to add an event to the global events container
  function addGlobalEvent(event) {
    console.log("Adding global event to UI:", event);
    const globalEventsContainer = document.getElementById('global-events');
    const eventElement = createEventElement(event);
    globalEventsContainer.appendChild(eventElement);
    console.log("Event added to global container:", eventElement);
  }
  
  // Function to add an event to the subscribed events container
  async function addSubscribedEvent(event) {
      const subscribedEventsContainer = document.getElementById('subscribed-events');
  
      if (!event || typeof event === 'undefined') {
          console.error('Received undefined event data');
          return;
      }
  
      let parsedEvent;
      try {
          parsedEvent = JSON.parse(JSON.stringify(event));
      } catch (error) {
          console.error('Error parsing event data:', error);
          console.error('Invalid event data:', event);
          return;
      }
  
      const eventElement = createEventElement(parsedEvent);
      subscribedEventsContainer.appendChild(eventElement);
  }
  
  // Function to fetch global events
  function fetchGlobalEvents() {
    console.log("Fetching global events");
    const globalFilter = {
        kinds: [0, 1],  // Fetch both kind 0 (metadata) and kind 1 (text notes)
        limit: 50
    };
  
    const globalSubId = 'global-' + Math.random().toString(36).substr(2, 9); // Generate a unique subscription ID
    console.log('Requesting global events:', JSON.stringify(['REQ', globalSubId, globalFilter]));
  
    var mainRelaySocket = sockets['wss://nostrpub.yeghro.site'];
    if (mainRelaySocket && mainRelaySocket.readyState === WebSocket.OPEN) {
        mainRelaySocket.send(JSON.stringify(['REQ', globalSubId, globalFilter]));
    } else {
        console.error("Main relay socket is not available or not open.");
    }
  }
  
  // Function to display error messages
  function displayErrorMessage(message) {
    const errorContainer = document.getElementById('error-container');
    if (errorContainer) {
      errorContainer.textContent = message;
      errorContainer.style.display = 'block';
    }
  }
    
})();


