//! The quit sequence. Background work stops first; storage must save before the process exits.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShutdownChoice {
    Retry,
    Cancel,
    Quit,
}

pub(crate) trait ShutdownSteps {
    async fn stop(&mut self);
    fn save(&mut self) -> Result<(), String>;
    fn close(&mut self) -> Result<(), String>;
    fn install(&mut self) -> Result<(), String>;
    fn restart(&mut self);
    fn exit(&mut self, code: i32);
    async fn on_install_failure(&mut self, error: String);
    fn recover(&mut self);
    async fn on_failure(&mut self, error: String) -> ShutdownChoice;
}

/// Returns `true` when the application exits. A failed save never installs an update.
pub(crate) async fn finish_shutdown(update: bool, steps: &mut impl ShutdownSteps) -> bool {
    steps.stop().await;
    loop {
        let result = steps.save().and_then(|()| steps.close());
        let Err(error) = result else { break };
        match steps.on_failure(error).await {
            ShutdownChoice::Retry => {}
            ShutdownChoice::Cancel => {
                steps.recover();
                return false;
            }
            ShutdownChoice::Quit => {
                // Work is already stopped. Exit without another write and never install an update.
                let _ = steps.close();
                steps.exit(0);
                return true;
            }
        }
    }
    if update {
        match steps.install() {
            Ok(()) => steps.restart(),
            Err(error) => {
                steps.on_install_failure(error).await;
                steps.exit(1);
            }
        }
    } else {
        steps.exit(0);
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct Recorder {
        failures: Vec<Result<(), String>>,
        choices: Vec<ShutdownChoice>,
        calls: Vec<String>,
        install_error: Option<String>,
    }

    impl ShutdownSteps for Recorder {
        fn stop(&mut self) -> impl Future<Output = ()> {
            self.calls.push("stop".into());
            std::future::ready(())
        }
        fn save(&mut self) -> Result<(), String> {
            self.calls.push("save".into());
            if self.failures.is_empty() { Ok(()) } else { self.failures.remove(0) }
        }
        fn close(&mut self) -> Result<(), String> {
            self.calls.push("close".into());
            Ok(())
        }
        fn install(&mut self) -> Result<(), String> {
            self.calls.push("install".into());
            self.install_error.take().map_or(Ok(()), Err)
        }
        fn restart(&mut self) {
            self.calls.push("restart".into());
        }
        fn exit(&mut self, code: i32) {
            self.calls.push(format!("exit:{code}"));
        }
        async fn on_install_failure(&mut self, error: String) {
            self.calls.push(format!("install-error:{error}"));
        }
        fn recover(&mut self) {
            self.calls.push("recover".into());
        }
        fn on_failure(&mut self, _error: String) -> impl Future<Output = ShutdownChoice> {
            self.calls.push("prompt".into());
            std::future::ready(self.choices.remove(0))
        }
    }

    #[tokio::test]
    async fn saves_then_installs_the_update() {
        let mut steps = Recorder::default();
        assert!(finish_shutdown(true, &mut steps).await);
        assert_eq!(steps.calls, ["stop", "save", "close", "install", "restart"]);
    }

    #[tokio::test]
    async fn retries_until_the_save_succeeds() {
        let mut steps = Recorder {
            failures: vec![Err("disk full".into())],
            choices: vec![ShutdownChoice::Retry],
            ..Default::default()
        };
        assert!(finish_shutdown(false, &mut steps).await);
        assert_eq!(steps.calls, ["stop", "save", "prompt", "save", "close", "exit:0"]);
    }

    #[tokio::test]
    async fn cancel_resumes_work() {
        let mut steps = Recorder {
            failures: vec![Err("disk full".into())],
            choices: vec![ShutdownChoice::Cancel],
            ..Default::default()
        };
        assert!(!finish_shutdown(true, &mut steps).await);
        assert_eq!(steps.calls, ["stop", "save", "prompt", "recover"]);
    }

    #[tokio::test]
    async fn quitting_without_saving_never_installs_an_update() {
        let mut steps = Recorder {
            failures: vec![Err("disk full".into())],
            choices: vec![ShutdownChoice::Quit],
            ..Default::default()
        };
        assert!(finish_shutdown(true, &mut steps).await);
        assert_eq!(steps.calls, ["stop", "save", "prompt", "close", "exit:0"]);
    }

    #[tokio::test]
    async fn reports_failed_installation_before_exiting_with_failure() {
        let mut steps = Recorder { install_error: Some("installation failed".into()), ..Default::default() };
        assert!(finish_shutdown(true, &mut steps).await);
        assert_eq!(steps.calls, ["stop", "save", "close", "install", "install-error:installation failed", "exit:1"]);
    }
}
