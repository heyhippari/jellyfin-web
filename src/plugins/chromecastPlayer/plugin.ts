import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { MediaType } from '@jellyfin/sdk/lib/generated-client/models/media-type';
import type { RepeatMode } from '@jellyfin/sdk/lib/generated-client/models/repeat-mode';
import type { ApiClient } from 'jellyfin-apiclient';

import { PluginType } from 'constants/pluginType';
import type { ItemDto } from 'types/base/models/item-dto';
import type { PlayerState, PlayState } from 'types/playbackStopInfo';
import type { PlayOptions } from 'types/playOptions';
import type { Plugin } from 'types/plugin';

import appSettings from '../../scripts/settings/appSettings';
import * as userSettings from '../../scripts/settings/userSettings';
import { playbackManager } from '../../components/playback/playbackmanager';
import globalize from '../../lib/globalize';
import CastSenderApi from './castSenderApi';
import alert from '../../components/alert';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import Events from '../../utils/events';
import { getItems } from '../../utils/jellyfin-apiclient/getItems';

// Based on https://github.com/googlecast/CastVideos-chrome/blob/master/CastVideos.js

const PlayerName = 'Google Cast';

/*
 * Some async CastSDK function are completed with callbacks.
 * sendConnectionResult turns this into completion as a promise.
 */
let _currentResolve: (() => void) | null = null;
let _currentReject: (() => void) | null = null;
function sendConnectionResult(isOk: boolean) {
    const resolve = _currentResolve;
    const reject = _currentReject;

    _currentResolve = null;
    _currentReject = null;

    if (isOk) {
        if (resolve) {
            resolve();
        }
    } else if (reject) {
        reject();
    } else {
        playbackManager.removeActivePlayer(PlayerName);
    }
}

/**
 * Constants of states for Chromecast device
 **/
enum DeviceState {
    IDLE = 0,
    ACTIVE = 1,
    WARNING = 2,
    ERROR = 3
}

/**
 * Constants of states for CastPlayer
 **/
enum CastPlayerState {
    IDLE = 'IDLE',
    LOADING = 'LOADING',
    LOADED = 'LOADED',
    PLAYING = 'PLAYING',
    PAUSED = 'PAUSED',
    STOPPED = 'STOPPED',
    SEEKING = 'SEEKING',
    ERROR = 'ERROR'
}

const messageNamespace = 'urn:x-cast:com.connectsdk';

/** The now playing item as reported by the receiver */
interface CastNowPlayingItem extends ItemDto {
    PrimaryImageTag?: string | null;
    BackdropImageTag?: string | null;
    BackdropItemId?: string | null;
}

interface CastPlayState extends PlayState {
    IsFullscreen?: boolean;
}

/** The player state as reported by the receiver */
interface CastPlayerData extends Partial<Omit<PlayerState, 'NowPlayingItem' | 'PlayState'>> {
    ItemId?: string | null;
    NowPlayingItem?: CastNowPlayingItem | null;
    PlayState?: CastPlayState;
    nextItem?: BaseItemDto | null;
}

interface CastMessageOptions {
    ServerId?: string | null;
    items?: BaseItemDto[] | null;
    [key: string]: unknown;
}

interface CastPlayOptions extends PlayOptions, CastMessageOptions {
    ids?: string[];
    serverId?: string;
}

type CastPlayOptionsWithItems = CastPlayOptions & { items: BaseItemDto[] };

interface CastMessage {
    options?: CastMessageOptions;
    command: string;
}

/** A message sent to the receiver, including the server connection info */
interface CastOutgoingMessage extends CastMessage {
    userId: string;
    deviceId: string;
    accessToken: string;
    serverAddress: string;
    serverId: string;
    serverVersion: string;
    receiverName: string | null;
    maxBitrate?: number;
    subtitleAppearance?: ReturnType<typeof userSettings.getSubtitleAppearanceSettings>;
    subtitleBurnIn?: string;
}

/** A message received from the receiver */
interface CastReceiverMessage {
    type?: string;
    data?: unknown;
}

class CastPlayer {
    /* device variables */
    deviceState = DeviceState.IDLE;

    /* Cast player variables */
    currentMediaSession: chrome.cast.media.Media | null = null;
    session: chrome.cast.Session | null = null;
    castPlayerState: CastPlayerState | chrome.cast.media.PlayerState = CastPlayerState.IDLE;

    hasReceivers = false;
    isInitialized?: boolean;

    errorHandler: (error: chrome.cast.Error) => void;
    mediaStatusUpdateHandler: (isAlive: boolean) => void;

    constructor() {
        // bind once - commit 2ebffc2271da0bc5e8b13821586aee2a2e3c7753
        this.errorHandler = this.onError.bind(this);
        this.mediaStatusUpdateHandler = this.onMediaStatusUpdate.bind(this);

        this.initializeCastPlayer();
    }

    /**
     * Initialize Cast media player
     * Initializes the API. Note that either successCallback and errorCallback will be
     * invoked once the API has finished initialization. The sessionListener and
     * receiverListener may be invoked at any time afterwards, and possibly more than once.
     */
    initializeCastPlayer() {
        const chrome = window.chrome;
        if (!chrome) {
            console.warn('Not initializing chromecast: chrome object is missing');
            return;
        }

        if (!chrome.cast?.isAvailable) {
            setTimeout(this.initializeCastPlayer.bind(this), 1000);
            return;
        }

        const apiClient = requireApiClient(ServerConnections.currentApiClient());
        const userId = apiClient.getCurrentUserId();

        void apiClient.getUser(userId).then(user => {
            const applicationID = user.Configuration!.CastReceiverId;
            if (!applicationID) {
                console.warn(`Not initializing chromecast: CastReceiverId is ${applicationID}`);
                return;
            }

            // request session
            const sessionRequest = new chrome.cast.SessionRequest(applicationID);
            const apiConfig = new chrome.cast.ApiConfig(sessionRequest,
                this.sessionListener.bind(this),
                this.receiverListener.bind(this));

            console.debug(`chromecast.initialize (applicationId=${applicationID})`);
            chrome.cast.initialize(apiConfig, this.onInitSuccess.bind(this), this.errorHandler);
        });
    }

    /**
     * Callback function for init success
     */
    onInitSuccess() {
        this.isInitialized = true;
        console.debug('[chromecastPlayer] init success');
    }

    /**
     * Generic error callback function
     */
    onError() {
        console.debug('[chromecastPlayer] error');
    }

    /**
     * @param e A new session
     * This handles auto-join when a page is reloaded
     * When active session is detected, playback will automatically
     * join existing session and occur in Cast mode and media
     * status gets synced up with current media of the session
     */
    sessionListener(e: chrome.cast.Session) {
        this.session = e;
        if (this.session) {
            if (this.session.media[0]) {
                this.onMediaDiscovered('activeSession', this.session.media[0]);
            }

            this.onSessionConnected(e);
        }
    }

    // messageListener - receive callback messages from the Cast receiver
    messageListener(namespace: string, message: string | CastReceiverMessage) {
        const receiverMessage: CastReceiverMessage = typeof message === 'string' ? JSON.parse(message) : message;

        if (receiverMessage.type === 'playbackerror') {
            const errorCode = receiverMessage.data;
            setTimeout(function () {
                alertText(globalize.translate('MessagePlaybackError' + errorCode), globalize.translate('HeaderPlaybackError'));
            }, 300);
        } else if (receiverMessage.type === 'connectionerror') {
            setTimeout(function () {
                alertText(globalize.translate('MessageChromecastConnectionError'), globalize.translate('HeaderError'));
            }, 300);
        } else if (receiverMessage.type) {
            Events.trigger(this, receiverMessage.type, [receiverMessage.data]);
        }
    }

    /**
     * @param e Receiver availability
     * This indicates availability of receivers but
     * does not provide a list of device IDs
     */
    receiverListener(e: chrome.cast.ReceiverAvailability) {
        if (e === 'available') {
            console.debug('[chromecastPlayer] receiver found');
            this.hasReceivers = true;
        } else {
            console.debug('[chromecastPlayer] receiver list empty');
            this.hasReceivers = false;
        }
    }

    /**
     * session update listener
     */
    sessionUpdateListener(isAlive: boolean) {
        if (isAlive) {
            console.debug('[chromecastPlayer] sessionUpdateListener: already alive');
        } else {
            this.session = null;
            this.deviceState = DeviceState.IDLE;
            this.castPlayerState = CastPlayerState.IDLE;
            document.removeEventListener('volumeupbutton', onVolumeUpKeyDown, false);
            document.removeEventListener('volumedownbutton', onVolumeDownKeyDown, false);

            console.debug('[chromecastPlayer] sessionUpdateListener: setting currentMediaSession to null');
            this.currentMediaSession = null;

            sendConnectionResult(false);
        }
    }

    /**
     * Requests that a receiver application session be created or joined. By default, the SessionRequest
     * passed to the API at initialization time is used; this may be overridden by passing a different
     * session request in opt_sessionRequest.
     */
    launchApp() {
        console.debug('[chromecastPlayer] launching app...');
        chrome.cast.requestSession(this.onRequestSessionSuccess.bind(this), this.onLaunchError.bind(this));
    }

    /**
     * Callback function for request session success
     * @param e A chrome.cast.Session object
     */
    onRequestSessionSuccess(e: chrome.cast.Session) {
        console.debug('[chromecastPlayer] session success: ' + e.sessionId);
        this.onSessionConnected(e);
    }

    onSessionConnected(session: chrome.cast.Session) {
        this.session = session;
        this.deviceState = DeviceState.ACTIVE;

        this.session.addMessageListener(messageNamespace, this.messageListener.bind(this));
        this.session.addMediaListener(this.sessionMediaListener.bind(this));
        this.session.addUpdateListener(this.sessionUpdateListener.bind(this));

        document.addEventListener('volumeupbutton', onVolumeUpKeyDown, false);
        document.addEventListener('volumedownbutton', onVolumeDownKeyDown, false);

        Events.trigger(this, 'connect');
        void this.sendMessage({
            options: {},
            command: 'Identify'
        });
    }

    /**
     * session update listener
     */
    sessionMediaListener(e: chrome.cast.media.Media) {
        this.currentMediaSession = e;
        this.currentMediaSession.addUpdateListener(this.mediaStatusUpdateHandler);
    }

    /**
     * Callback function for launch error
     */
    onLaunchError() {
        console.debug('[chromecastPlayer] launch error');
        this.deviceState = DeviceState.ERROR;
        sendConnectionResult(false);
    }

    /**
     * Stops the running receiver application associated with the session.
     */
    stopApp() {
        if (this.session) {
            this.session.stop(this.onStopAppSuccess.bind(this, 'Session stopped'), this.errorHandler);
        }
    }

    /**
     * Callback function for stop app success
     */
    onStopAppSuccess(message: string) {
        console.debug(message);

        this.deviceState = DeviceState.IDLE;
        this.castPlayerState = CastPlayerState.IDLE;
        document.removeEventListener('volumeupbutton', onVolumeUpKeyDown, false);
        document.removeEventListener('volumedownbutton', onVolumeDownKeyDown, false);

        this.currentMediaSession = null;
    }

    /**
     * Returns the current session, or throws if there is none.
     */
    getSession() {
        if (!this.session) {
            throw new Error('[chromecastPlayer] no session');
        }

        return this.session;
    }

    /**
     * Loads media into a running receiver application
     * @param options - The play options, including the items to play
     * @param command - The command to send to the receiver
     */
    loadMedia(options: CastPlayOptionsWithItems, command: string) {
        if (!this.session) {
            console.debug('[chromecastPlayer] no session');
            return Promise.reject(new Error('no session'));
        }

        // convert items to smaller stubs to send minimal amount of information
        options.items = options.items.map(function (i) {
            return {
                Id: i.Id,
                ServerId: i.ServerId,
                Name: i.Name,
                Type: i.Type,
                MediaType: i.MediaType,
                IsFolder: i.IsFolder
            };
        });

        return this.sendMessage({
            options: options,
            command: command
        });
    }

    sendMessage(message: CastMessage) {
        let receiverName = null;

        const session = this.session;

        if (session?.receiver?.friendlyName) {
            receiverName = session.receiver.friendlyName;
        }

        let apiClient;
        if (message.options?.ServerId) {
            apiClient = ServerConnections.getApiClient(message.options.ServerId);
        } else if (message.options?.items?.length) {
            apiClient = ServerConnections.getApiClient(message.options.items[0].ServerId);
        } else {
            apiClient = ServerConnections.currentApiClient();
        }
        apiClient = requireApiClient(apiClient);

        /* If serverAddress is localhost,this address can not be used for the cast receiver device.
         * Use the local address (ULA, Unique Local Address) in that case.
         */
        const serverAddress = apiClient.serverAddress();
        const hostname = (new URL(serverAddress)).hostname;
        const isLocalhost = hostname === 'localhost' || hostname.startsWith('127.') || hostname === '[::1]';
        const serverLocalAddress = isLocalhost ? apiClient.serverInfo().LocalAddress : serverAddress;

        const outgoingMessage: CastOutgoingMessage = Object.assign(message, {
            userId: apiClient.getCurrentUserId(),
            deviceId: apiClient.deviceId(),
            accessToken: apiClient.accessToken(),
            serverAddress: serverLocalAddress,
            serverId: apiClient.serverId(),
            serverVersion: apiClient.serverVersion(),
            receiverName: receiverName
        });

        console.debug('[chromecastPlayer] message{' + outgoingMessage.command + '; ' + serverAddress + ' -> ' + serverLocalAddress + '}');

        const bitrateSetting = appSettings.maxChromecastBitrate();
        if (bitrateSetting) {
            outgoingMessage.maxBitrate = bitrateSetting;
        }

        if (outgoingMessage.options?.items) {
            outgoingMessage.subtitleAppearance = userSettings.getSubtitleAppearanceSettings();
            outgoingMessage.subtitleBurnIn = appSettings.get('subtitleburnin') || '';
        }

        return this.sendMessageInternal(outgoingMessage);
    }

    sendMessageInternal(message: CastOutgoingMessage) {
        const serializedMessage = JSON.stringify(message);

        this.getSession().sendMessage(messageNamespace, serializedMessage, this.onPlayCommandSuccess.bind(this), this.errorHandler);
        return Promise.resolve();
    }

    onPlayCommandSuccess() {
        console.debug('Message was sent to receiver ok.');
    }

    /**
     * Callback function for loadMedia success
     * @param how How the media was discovered
     * @param media A new media object.
     */
    onMediaDiscovered(how: 'activeSession' | 'loadMedia', media: chrome.cast.media.Media) {
        console.debug('[chromecastPlayer] new media session ID:' + media.mediaSessionId + ' (' + how + ')');
        this.currentMediaSession = media;

        if (how === 'loadMedia') {
            this.castPlayerState = CastPlayerState.PLAYING;
        }

        if (how === 'activeSession') {
            this.castPlayerState = media.playerState;
        }

        this.currentMediaSession.addUpdateListener(this.mediaStatusUpdateHandler);
    }

    /**
     * Callback function for media status update from receiver
     * @param e true/false
     */
    onMediaStatusUpdate(e: boolean) {
        console.debug('[chromecastPlayer] updating media: ' + e);
        if (e === false) {
            this.castPlayerState = CastPlayerState.IDLE;
        }
    }

    /**
     * Set media volume in Cast mode
     * @param mute A boolean
     * @param vol The volume level
     */
    setReceiverVolume(mute: boolean, vol?: number) {
        if (!this.currentMediaSession) {
            console.debug('this.currentMediaSession is null');
            return;
        }

        if (!mute) {
            this.getSession().setReceiverVolumeLevel((vol || 1),
                this.mediaCommandSuccessCallback.bind(this),
                this.errorHandler);
        } else {
            this.getSession().setReceiverMuted(true,
                this.mediaCommandSuccessCallback.bind(this),
                this.errorHandler);
        }
    }

    /**
     * Mute CC
     */
    mute() {
        this.setReceiverVolume(true);
    }

    /**
     * Callback function for media command success
     */
    mediaCommandSuccessCallback(info?: unknown) {
        console.debug(info);
    }
}

/**
 * Returns the ApiClient, or throws if it is undefined.
 */
function requireApiClient(apiClient: ApiClient | undefined) {
    if (!apiClient) {
        throw new Error('[chromecastPlayer] no ApiClient available');
    }

    return apiClient;
}

/**
 * Sets the receiver volume level without success or error callbacks.
 */
function setReceiverVolumeLevel(session: chrome.cast.Session, level: number) {
    session.setReceiverVolumeLevel(level, () => { /* empty */ }, () => { /* empty */ });
}

function alertText(text: string, title: string) {
    void alert({
        text,
        title
    });
}

function onVolumeUpKeyDown() {
    playbackManager.volumeUp();
}

function onVolumeDownKeyDown() {
    playbackManager.volumeDown();
}

function normalizeImages(state: CastPlayerData | null | undefined) {
    if (state?.NowPlayingItem) {
        const item = state.NowPlayingItem;

        if ((!item.ImageTags?.Primary) && item.PrimaryImageTag) {
            item.ImageTags = item.ImageTags || {};
            item.ImageTags.Primary = item.PrimaryImageTag;
        }
        if (item.BackdropImageTag && item.BackdropItemId === item.Id) {
            item.BackdropImageTags = [item.BackdropImageTag];
        }
        if (item.BackdropImageTag && item.BackdropItemId !== item.Id) {
            item.ParentBackdropImageTags = [item.BackdropImageTag];
            item.ParentBackdropItemId = item.BackdropItemId;
        }
    }
}

interface ItemsForPlaybackQuery {
    Ids?: string;
    Limit?: number;
    ExcludeLocationTypes?: string;
    EnableTotalRecordCount?: boolean;
}

function getItemsForPlayback(apiClient: ApiClient, query: ItemsForPlaybackQuery) {
    const userId = apiClient.getCurrentUserId();

    if (query.Ids && query.Ids.split(',').length === 1) {
        // Ids contains exactly one id here
        return apiClient.getItem(userId, query.Ids).then(function (item) {
            return {
                Items: [item],
                TotalRecordCount: 1
            };
        });
    } else {
        query.Limit = query.Limit || 100;
        query.ExcludeLocationTypes = 'Virtual';
        query.EnableTotalRecordCount = false;

        return getItems(apiClient, userId, query);
    }
}

function hasItems(options: CastPlayOptions): options is CastPlayOptionsWithItems {
    return !!options.items;
}

/*
 * relay castPlayer events to ChromecastPlayer events and include state info
 */
function bindEventForRelay(instance: ChromecastPlayer, castPlayer: CastPlayer, eventName: string) {
    Events.on(castPlayer, eventName, function (_e, data?: CastPlayerData) {
        console.debug('[chromecastPlayer] ' + eventName);
        // skip events without data
        if (data?.ItemId) {
            const state = instance.getPlayerStateInternal(data);
            Events.trigger(instance, eventName, [state]);
        }
    });
}

function initializeChromecast(instance: ChromecastPlayer) {
    const castPlayer = new CastPlayer();
    instance._castPlayer = castPlayer;

    // To allow the native android app to override
    document.dispatchEvent(new CustomEvent('chromecastloaded', {
        detail: {
            player: instance
        }
    }));

    Events.on(castPlayer, 'connect', function () {
        if (_currentResolve) {
            sendConnectionResult(true);
        } else {
            playbackManager.setActivePlayer(PlayerName, instance.getCurrentTargetInfo());
        }

        console.debug('[chromecastPlayer] connect');
        // Reset this so that statechange will fire
        instance.lastPlayerData = null;
    });

    Events.on(castPlayer, 'playbackstart', function (_e, data: CastPlayerData) {
        console.debug('[chromecastPlayer] playbackstart');

        castPlayer.initializeCastPlayer();

        const state = instance.getPlayerStateInternal(data);
        Events.trigger(instance, 'playbackstart', [state]);

        // be prepared that after this media item a next one may follow. See playbackManager
        instance._playNextAfterEnded = true;
    });

    Events.on(castPlayer, 'playbackstop', function (_e, data: CastPlayerData) {
        console.debug('[chromecastPlayer] playbackstop');

        const state = instance.getPlayerStateInternal(data);

        if (!instance._playNextAfterEnded) {
            // mark that no next media items are to be processed.
            state.nextItem = null;
            state.NextMediaType = null;
        }
        Events.trigger(instance, 'playbackstop', [state]);

        const playState = instance.lastPlayerData!.PlayState || {};
        const volume = playState.VolumeLevel || 0.5;
        const mute = playState.IsMuted || false;

        // Reset this so the next query doesn't make it appear like content is playing.
        instance.lastPlayerData = {
            PlayState: {
                VolumeLevel: volume,
                IsMuted: mute
            }
        };
    });

    Events.on(castPlayer, 'playbackprogress', function (_e, data: CastPlayerData) {
        console.debug('[chromecastPlayer] positionchange');
        const state = instance.getPlayerStateInternal(data);

        Events.trigger(instance, 'timeupdate', [state]);
    });

    bindEventForRelay(instance, castPlayer, 'timeupdate');
    bindEventForRelay(instance, castPlayer, 'pause');
    bindEventForRelay(instance, castPlayer, 'unpause');
    bindEventForRelay(instance, castPlayer, 'volumechange');
    bindEventForRelay(instance, castPlayer, 'repeatmodechange');
    bindEventForRelay(instance, castPlayer, 'shufflequeuemodechange');

    Events.on(castPlayer, 'playstatechange', function (_e, data: CastPlayerData) {
        console.debug('[chromecastPlayer] playstatechange');

        // Updates the player and nowPlayingBar state to the current 'pause' state.
        const state = instance.getPlayerStateInternal(data);
        Events.trigger(instance, 'pause', [state]);
    });
}

function loadChromecast(instance: ChromecastPlayer) {
    void new CastSenderApi().load().then(() => {
        Events.on(ServerConnections, 'localusersignedin', () => {
            initializeChromecast(instance);
        });

        // NOTE: ServerConnections has no currentUserId property, so this is always falsy.
        if ((ServerConnections as { currentUserId?: string }).currentUserId) {
            initializeChromecast(instance);
        }
    });
}

class ChromecastPlayer implements Plugin {
    // playbackManager needs this
    name = PlayerName;
    type = PluginType.MediaPlayer;
    id = 'chromecast';
    isLocalPlayer = false;
    lastPlayerData: CastPlayerData | null = {};

    _castPlayer?: CastPlayer;
    _playNextAfterEnded?: boolean;

    constructor() {
        loadChromecast(this);
    }

    /** The cast player, which is only available once chromecast has been initialized */
    private get castPlayer() {
        if (!this._castPlayer) {
            throw new Error('[chromecastPlayer] chromecast is not initialized');
        }

        return this._castPlayer;
    }

    /*
     * Cast button handling: select and connect to chromecast receiver
     */
    tryPair() {
        const castPlayer = this.castPlayer;

        if (castPlayer.deviceState !== DeviceState.ACTIVE && castPlayer.isInitialized) {
            return new Promise<void>(function (resolve, reject) {
                _currentResolve = resolve;
                _currentReject = reject;
                castPlayer.launchApp();
            });
        } else {
            _currentResolve = null;
            _currentReject = null;
            return Promise.reject(new Error('tryPair failed'));
        }
    }

    getTargets() {
        const targets = [];

        if (this._castPlayer?.hasReceivers) {
            targets.push(this.getCurrentTargetInfo());
        }

        return Promise.resolve(targets);
    }

    // This is a privately used method
    getCurrentTargetInfo() {
        let appName = null;

        const castPlayer = this.castPlayer;

        if (castPlayer.session?.receiver?.friendlyName) {
            appName = castPlayer.session.receiver.friendlyName;
        }

        return {
            name: PlayerName,
            id: PlayerName,
            playerName: PlayerName,
            playableMediaTypes: ['Audio', 'Video'],
            isLocalPlayer: false,
            appName: PlayerName,
            deviceName: appName,
            deviceType: 'cast',
            supportedCommands: [
                'VolumeUp',
                'VolumeDown',
                'Mute',
                'Unmute',
                'ToggleMute',
                'SetVolume',
                'SetAudioStreamIndex',
                'SetSubtitleStreamIndex',
                'DisplayContent',
                'SetRepeatMode'
            ]
        };
    }

    getPlayerStateInternal(data: CastPlayerData): CastPlayerData;
    getPlayerStateInternal(data?: CastPlayerData | null): CastPlayerData | null;
    getPlayerStateInternal(data?: CastPlayerData | null) {
        let triggerStateChange = false;
        if (data && !this.lastPlayerData) {
            triggerStateChange = true;
        }

        data = data || this.lastPlayerData;
        this.lastPlayerData = data;

        normalizeImages(data);

        if (triggerStateChange) {
            Events.trigger(this, 'statechange', [data]);
        }

        return data;
    }

    playWithCommand(options: CastPlayOptions, command: string): Promise<void> {
        if (!hasItems(options)) {
            const apiClient = requireApiClient(ServerConnections.getApiClient(options.serverId));

            return apiClient.getItem(apiClient.getCurrentUserId(), options.ids![0]).then(item => {
                options.items = [item];
                return this.playWithCommand(options, command);
            });
        }

        const ids = options.ids;
        if (options.items.length > 1 && ids) {
            // Use the original request id array for sorting the result in the proper order
            options.items.sort(function (a, b) {
                return ids.indexOf(a.Id!) - ids.indexOf(b.Id!);
            });
        }

        return this.castPlayer.loadMedia(options, command);
    }

    seek(position: number | string) {
        const seconds = parseInt(String(position), 10) / 10000000;

        void this.castPlayer.sendMessage({
            options: {
                position: seconds
            },
            command: 'Seek'
        });
    }

    setAudioStreamIndex(index: number) {
        void this.castPlayer.sendMessage({
            options: {
                index: index
            },
            command: 'SetAudioStreamIndex'
        });
    }

    setSubtitleStreamIndex(index: number) {
        void this.castPlayer.sendMessage({
            options: {
                index: index
            },
            command: 'SetSubtitleStreamIndex'
        });
    }

    setMaxStreamingBitrate(options: CastMessageOptions) {
        void this.castPlayer.sendMessage({
            options: options,
            command: 'SetMaxStreamingBitrate'
        });
    }

    isFullscreen() {
        return this.lastPlayerData?.PlayState?.IsFullscreen;
    }

    nextTrack() {
        void this.castPlayer.sendMessage({
            options: {},
            command: 'NextTrack'
        });
    }

    previousTrack() {
        void this.castPlayer.sendMessage({
            options: {},
            command: 'PreviousTrack'
        });
    }

    volumeDown() {
        const session = this.castPlayer.getSession();
        let vol = session.receiver.volume.level ?? 0.5;
        vol -= 0.05;
        vol = Math.max(vol, 0);

        setReceiverVolumeLevel(session, vol);
    }

    endSession() {
        void this.stop().then(() => {
            setTimeout(() => {
                this.castPlayer.stopApp();
            }, 1000);
        });
    }

    volumeUp() {
        const session = this.castPlayer.getSession();
        let vol = session.receiver.volume.level ?? 0.5;
        vol += 0.05;
        vol = Math.min(vol, 1);

        setReceiverVolumeLevel(session, vol);
    }

    setVolume(vol: number) {
        vol = Math.min(vol, 100);
        vol = Math.max(vol, 0);
        vol = vol / 100;

        setReceiverVolumeLevel(this.castPlayer.getSession(), vol);
    }

    unpause() {
        void this.castPlayer.sendMessage({
            options: {},
            command: 'Unpause'
        });
    }

    playPause() {
        void this.castPlayer.sendMessage({
            options: {},
            command: 'PlayPause'
        });
    }

    pause() {
        void this.castPlayer.sendMessage({
            options: {},
            command: 'Pause'
        });
    }

    stop() {
        // suppress playing a next media item after this one. See playbackManager
        this._playNextAfterEnded = false;
        return this.castPlayer.sendMessage({
            options: {},
            command: 'Stop'
        });
    }

    displayContent(options: CastMessageOptions) {
        void this.castPlayer.sendMessage({
            options: options,
            command: 'DisplayContent'
        });
    }

    setMute(isMuted: boolean) {
        const castPlayer = this.castPlayer;

        if (isMuted) {
            void castPlayer.sendMessage({
                options: {},
                command: 'Mute'
            });
        } else {
            void castPlayer.sendMessage({
                options: {},
                command: 'Unmute'
            });
        }
    }

    getRepeatMode() {
        return this.lastPlayerData?.PlayState?.RepeatMode;
    }

    getQueueShuffleMode() {
        return this.lastPlayerData?.PlayState?.ShuffleMode;
    }

    playTrailers() {
        console.warn('[chromecastPlayer] Playing trailers is not supported.');
    }

    setRepeatMode(mode: RepeatMode) {
        void this.castPlayer.sendMessage({
            options: {
                RepeatMode: mode
            },
            command: 'SetRepeatMode'
        });
    }

    setQueueShuffleMode() {
        console.warn('[chromecastPlayer] Setting shuffle queue mode is not supported.');
    }

    toggleMute() {
        void this.castPlayer.sendMessage({
            options: {},
            command: 'ToggleMute'
        });
    }

    audioTracks() {
        const streams = this.lastPlayerData?.NowPlayingItem?.MediaStreams || [];
        return streams.filter(function (s) {
            return s.Type === 'Audio';
        });
    }

    getAudioStreamIndex() {
        return this.lastPlayerData?.PlayState?.AudioStreamIndex;
    }

    subtitleTracks() {
        const streams = this.lastPlayerData?.NowPlayingItem?.MediaStreams || [];
        return streams.filter(function (s) {
            return s.Type === 'Subtitle';
        });
    }

    getSubtitleStreamIndex() {
        return this.lastPlayerData?.PlayState?.SubtitleStreamIndex;
    }

    getMaxStreamingBitrate() {
        return this.lastPlayerData?.PlayState?.MaxStreamingBitrate;
    }

    getVolume() {
        const volumeLevel = this.lastPlayerData?.PlayState?.VolumeLevel;

        return volumeLevel == null ? 100 : volumeLevel;
    }

    isPlaying(mediaType?: MediaType | string) {
        const nowPlayingItem = this.lastPlayerData?.NowPlayingItem;
        return nowPlayingItem != null && (nowPlayingItem.MediaType === mediaType || !mediaType);
    }

    isPlayingVideo() {
        return this.lastPlayerData?.NowPlayingItem?.MediaType === 'Video';
    }

    isPlayingAudio() {
        return this.lastPlayerData?.NowPlayingItem?.MediaType === 'Audio';
    }

    currentTime(val?: number | null) {
        if (val != null) {
            return this.seek(val * 10000);
        }

        // Number() matches the implicit coercion of a missing value (NaN for undefined, 0 for null)
        return Number(this.lastPlayerData?.PlayState?.PositionTicks) / 10000;
    }

    duration() {
        return this.lastPlayerData?.NowPlayingItem?.RunTimeTicks;
    }

    getBufferedRanges() {
        return this.lastPlayerData?.PlayState?.BufferedRanges || [];
    }

    paused() {
        return this.lastPlayerData?.PlayState?.IsPaused;
    }

    isMuted() {
        return this.lastPlayerData?.PlayState?.IsMuted;
    }

    shuffle(item: BaseItemDto) {
        const apiClient = requireApiClient(ServerConnections.getApiClient(item.ServerId));
        const userId = apiClient.getCurrentUserId();

        void apiClient.getItem(userId, item.Id!).then(fetchedItem => {
            void this.playWithCommand({
                items: [fetchedItem]
            }, 'Shuffle');
        });
    }

    instantMix(item: BaseItemDto) {
        const apiClient = requireApiClient(ServerConnections.getApiClient(item.ServerId));
        const userId = apiClient.getCurrentUserId();

        void apiClient.getItem(userId, item.Id!).then(fetchedItem => {
            void this.playWithCommand({
                items: [fetchedItem]
            }, 'InstantMix');
        });
    }

    canPlayMediaType(mediaType?: string | null) {
        mediaType = (mediaType || '').toLowerCase();
        return mediaType === 'audio' || mediaType === 'video';
    }

    canQueueMediaType(mediaType?: string | null) {
        return this.canPlayMediaType(mediaType);
    }

    queue(options: CastPlayOptions) {
        void this.playWithCommand(options, 'PlayLast');
    }

    queueNext(options: CastPlayOptions) {
        void this.playWithCommand(options, 'PlayNext');
    }

    /*
     * play
     * options.items[]: Id, IsFolder, MediaType, Name, ServerId, Type, ...
     */
    play(options: CastPlayOptions) {
        if (options.items) {
            return this.playWithCommand(options, 'PlayNow');
        } else {
            if (!options.serverId) {
                throw new Error('serverId required!');
            }

            const apiClient = requireApiClient(ServerConnections.getApiClient(options.serverId));

            return getItemsForPlayback(apiClient, {
                Ids: options.ids!.join(',')
            }).then(result => {
                options.items = result.Items;
                return this.playWithCommand(options, 'PlayNow');
            });
        }
    }

    toggleFullscreen() {
        // not supported
    }

    beginPlayerUpdates() {
        // Setup polling here
    }

    endPlayerUpdates() {
        // Stop polling here
    }

    getPlaylist() {
        return Promise.resolve([]);
    }

    getCurrentPlaylistItemId() {
        // not supported?
    }

    setCurrentPlaylistItem() {
        return Promise.resolve();
    }

    removeFromPlaylist() {
        return Promise.resolve();
    }

    getPlayerState() {
        return this.getPlayerStateInternal() || {};
    }

    getCurrentPlaylistIndex() {
        // tbd: update to support playlists and not only album with tracks
        return this.getPlayerStateInternal()?.NowPlayingItem?.IndexNumber;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    clearQueue(currentTime?: number) {
        // not supported yet
    }
}

export default ChromecastPlayer;
