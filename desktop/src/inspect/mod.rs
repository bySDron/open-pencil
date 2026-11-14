//! The inspector a live page runs, injected into every frame of the window.
//!
//! A live page is served by the project's dev server, which is another origin: the app cannot read
//! that document, and turning off the webview's same-origin rule to do so costs the app its own
//! command channel (Chromium then drops the `Origin` header Tauri's commands are made of). A script
//! injected at document creation runs inside the page instead, on every frame of the webview, and
//! answers the app over `postMessage`. The runtime itself is `runtime.js`, kept as its own file so
//! it can be read and reasoned about like any other program.
//!
//! A change to `runtime.js` reaches the running app only after the binary is rebuilt: the file is
//! embedded at compile time, which cargo tracks, but a watcher that only follows Rust sources does
//! not start that build by itself.

/// The inspector's own source, embedded so a release build needs no file beside the binary.
pub const RUNTIME: &str = include_str!("runtime.js");

#[cfg(test)]
mod tests {
    use super::RUNTIME;

    #[test]
    fn the_runtime_is_a_script_that_answers_the_window() {
        // A build that lost the file would embed an empty script and every frame would stay dumb.
        assert!(RUNTIME.len() > 1000);
        assert!(RUNTIME.contains("__openPencilInspectInstalled"));
        assert!(RUNTIME.contains("open-pencil-host"));
        assert!(RUNTIME.contains("open-pencil-inspect"));
    }
}
