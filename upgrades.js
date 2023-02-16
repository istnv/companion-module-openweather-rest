export const UpgradeScripts = [
	function (context, props) {
		const result = {
			updatedConfig: null,
			updatedActions: [],
			updatedFeedbacks: [],
		}

		if (props.config) {
			if (props.config.refresh == undefined) {
				props.config.refresh = 20

				result.config = props.config
			}
		}

		return result
	},
]